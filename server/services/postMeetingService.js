// ============================================================================
// Post-meeting flow — "did the meeting happen?" + structured feedback.
// ============================================================================
// This is the lifecycle AFTER a Meeting's scheduled time has passed. It reuses
// the models the schema already provided for this exact purpose:
//
//   MeetingOutcomeConfirmation  one row per participant, { occurred } — the
//                               LIFECYCLE input. Both rows together decide the
//                               Meeting / MentoringRequest status (its own
//                               schema comment: "the backend combines both
//                               participants' answers to decide the next
//                               status transition").
//   Feedback                    one row per participant — the dedicated,
//                               STRUCTURED analytics store (rating, wasHelpful,
//                               notOccurredReason, …). Extended from the old
//                               `answers Json` into real columns so it is
//                               queryable and kept verbatim regardless of what
//                               the request status does later.
//   Notification POST_MEETING_CHECK   the "הפגישה הסתיימה — נשמח לשמוע איך היה"
//                               in-app item. Type already existed in the enum.
//
// Every write goes through this service; the frontend never owns any of this
// state. AUTH SEAM is identical to routes/scheduling.js — the acting user id is
// passed in explicitly and checked against the meeting's mentee / mentor.
//
// NO background scheduler exists in this project. The POST_MEETING_CHECK
// notification is therefore MATERIALIZED LAZILY (see
// materializeDuePostMeetingNotificationsForUser) the next time a participant
// touches the notification API, guarded so the same (recipient, meeting) row is
// only ever created once. A future scheduled worker would call the same sweep
// for every user on a timer instead — nothing else would change.
// ============================================================================

const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");
const { parseId } = require("./userService");
const { createNotifications } = require("./notificationService");
// Follow-up meetings reuse the EXISTING scheduling architecture: a brand-new
// MentoringRequest for the same (mentee, mentorProfile) pair, started at the
// normal initial status. The Part 1 state machine is not touched.
const requestService = require("./requestService");
// Outbound email is a NOTIFICATION SIDE EFFECT only — dispatched AFTER the
// feedback transaction commits, fire-and-forget. It can never change feedback /
// meeting / request state or fail a submission. See submitFeedback().
const emailService = require("./emailService");

// ----------------------------------------------------------------------------
// Vocabulary — mirrors the Prisma enums (schema.prisma). Kept here so the route
// layer validates against one list and the client can be served the same list.
// ----------------------------------------------------------------------------
const PARTICIPANT_ROLE = { MENTEE: "MENTEE", MENTOR: "MENTOR" };

const NOT_OCCURRED_REASONS = [
  "COULD_NOT_ATTEND", // לא הסתדר לי להגיע
  "OTHER_PARTY_NO_SHOW", // הצד השני לא הגיע
  "CANCELLED_IN_ADVANCE", // ביטלנו מראש
  "TECHNICAL_ISSUE", // הייתה בעיה טכנית
  "COULD_NOT_RESCHEDULE", // לא הצלחנו לתאם מחדש
  "OTHER", // אחר (+ free text, required)
];

const HELPFULNESS = ["YES", "SOMEWHAT", "NO"];
const CONTINUE_INTEREST = ["YES", "NO", "NOT_SURE_YET"];

const RATING_MIN = 1;
const RATING_MAX = 5;
const MAX_TEXT = 1000; // notOccurredExplanation / comment upper bound
const MIN_OTHER_EXPLANATION = 1; // OTHER must carry *some* text

// Part 3: a participant who has not completed feedback is reminded again, at
// least this far apart from the previous nudge (POST_MEETING_CHECK or the last
// FEEDBACK_REMINDER). No scheduler exists — reminders are materialized lazily
// from the notification read model, exactly like POST_MEETING_CHECK.
const FEEDBACK_REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;

// Meeting statuses from which the post-meeting flow is still meaningful. A
// CANCELLED / RESCHEDULED meeting is out of scope (handled by Part 14/15).
const OPEN_MEETING_STATUSES = ["SCHEDULED", "NOT_COMPLETED", "COMPLETED"];
// Request statuses this flow is allowed to move FROM (or leave untouched). It
// never resurrects a REJECTED / CANCELLED request.
const OPEN_REQUEST_STATUSES = ["MATCHED", "NOT_COMPLETED", "COMPLETED", "FEEDBACK_COMPLETED"];

// The meeting + both participant identities, in one shape.
const MEETING_INCLUDE = {
  request: {
    select: {
      id: true,
      status: true,
      menteeId: true,
      mentorProfileId: true,
      mentee: { select: { id: true, fullName: true } },
      mentorProfile: {
        select: { userId: true, user: { select: { id: true, fullName: true } } },
      },
    },
  },
};

// Resolve who the acting user is on this meeting, or 403.
function resolveRole(meeting, actingUserId) {
  const menteeId = meeting.request.menteeId;
  const mentorUserId = meeting.request.mentorProfile.userId;
  if (actingUserId === menteeId) return PARTICIPANT_ROLE.MENTEE;
  if (actingUserId === mentorUserId) return PARTICIPANT_ROLE.MENTOR;
  throw new ApiError(
    `User ${actingUserId} is not a participant of meeting ${meeting.id}`,
    403
  );
}

function participantsOf(meeting) {
  return {
    menteeId: meeting.request.menteeId,
    mentorUserId: meeting.request.mentorProfile.userId,
    menteeName: meeting.request.mentee ? meeting.request.mentee.fullName : null,
    mentorName:
      meeting.request.mentorProfile && meeting.request.mentorProfile.user
        ? meeting.request.mentorProfile.user.fullName
        : null,
  };
}

async function loadMeetingOr404(rawMeetingId) {
  const meetingId = parseId(rawMeetingId, "meetingId");
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: MEETING_INCLUDE,
  });
  if (!meeting) throw new ApiError(`Meeting ${meetingId} not found`, 404);
  return meeting;
}

// Pair-level "do we both want another meeting?" state (Part 2), derived from the
// two Feedback rows for this meeting. `wantsAnotherMeeting` is only meaningful on
// an occurred = true row. Only when BOTH participants said YES may the pair open
// a fresh MentoringRequest — and then only if one is not already open.
async function continuationShape(client, meeting, actingUserId) {
  const menteeId = meeting.request.menteeId;
  const mentorUserId = meeting.request.mentorProfile.userId;
  const otherId = actingUserId === menteeId ? mentorUserId : menteeId;

  const rows = await client.feedback.findMany({
    where: { meetingId: meeting.id },
    select: { authorId: true, occurred: true, wantsAnotherMeeting: true },
  });
  const wants = (uid) => {
    const r = rows.find((x) => x.authorId === uid);
    return !!(r && r.occurred === true && r.wantsAnotherMeeting === true);
  };
  const mineRow = rows.find((r) => r.authorId === actingUserId) || null;
  const bothWantAnother = wants(menteeId) && wants(mentorUserId);

  let followUpRequestId = null;
  if (bothWantAnother) {
    const open = await requestService.findOpenRequest(
      menteeId,
      meeting.request.mentorProfileId
    );
    followUpRequestId = open ? open.id : null;
  }

  return {
    myAnswer: mineRow ? mineRow.wantsAnotherMeeting : null, // true | false | null
    otherSubmitted: rows.some((r) => r.authorId === otherId),
    bothWantAnother,
    followUpRequestId,
    // The button the UI shows: both said YES and there is no follow-up yet.
    canStartAnother: bothWantAnother && followUpRequestId == null,
  };
}

// The presentational + gating shape both the GET and the POST return.
async function contextShape(client, meeting, role, actingUserId, mySubmission) {
  const p = participantsOf(meeting);
  const ended = meeting.scheduledEnd.getTime() <= Date.now();
  return {
    meeting: {
      id: meeting.id,
      scheduledStart: meeting.scheduledStart,
      scheduledEnd: meeting.scheduledEnd,
      status: meeting.status,
    },
    requestStatus: meeting.request.status,
    role, // MENTEE | MENTOR
    otherPartyName: role === PARTICIPANT_ROLE.MENTEE ? p.mentorName : p.menteeName,
    mentorName: p.mentorName,
    menteeName: p.menteeName,
    meetingEnded: ended,
    // Post-meeting flow is available only once the meeting has ended AND the
    // meeting/request are still in an open state.
    canSubmit:
      ended &&
      !mySubmission &&
      OPEN_MEETING_STATUSES.includes(meeting.status) &&
      OPEN_REQUEST_STATUSES.includes(meeting.request.status),
    alreadySubmitted: Boolean(mySubmission),
    submission: mySubmission
      ? {
          occurred: mySubmission.occurred,
          notOccurredReason: mySubmission.notOccurredReason,
          notOccurredExplanation: mySubmission.notOccurredExplanation,
          rating: mySubmission.rating,
          wasHelpful: mySubmission.wasHelpful,
          wouldContinueMentoring: mySubmission.wouldContinueMentoring,
          wantsAnotherMeeting: mySubmission.wantsAnotherMeeting,
          comment: mySubmission.comment,
          submittedAt: mySubmission.submittedAt,
        }
      : null,
    // Pair-level continuation state (Part 2).
    continuation: await continuationShape(client, meeting, actingUserId),
    // Served so the client renders exactly the reasons the backend accepts.
    reasons: NOT_OCCURRED_REASONS,
  };
}

// ----------------------------------------------------------------------------
// GET — everything the feedback page needs to render itself.
// ----------------------------------------------------------------------------
async function getFeedbackContext(rawMeetingId, rawActingUserId) {
  const actingUserId = parseId(rawActingUserId, "actingUserId");
  const meeting = await loadMeetingOr404(rawMeetingId);
  const role = resolveRole(meeting, actingUserId); // 403 if not a participant

  const mySubmission = await prisma.feedback.findUnique({
    where: { meetingId_authorId: { meetingId: meeting.id, authorId: actingUserId } },
  });

  return contextShape(prisma, meeting, role, actingUserId, mySubmission);
}

// ----------------------------------------------------------------------------
// Validation — turns the raw body into the exact { outcome, feedback } rows.
// ----------------------------------------------------------------------------
function cleanText(raw, field) {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    throw new ApiError(`${field} must be a string`, 400);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_TEXT) {
    throw new ApiError(`${field} must be at most ${MAX_TEXT} characters`, 400);
  }
  return trimmed;
}

function normalizeSubmission(body, role) {
  if (typeof body.occurred !== "boolean") {
    throw new ApiError("occurred (boolean) is required", 400);
  }

  if (body.occurred === false) {
    const reason = body.notOccurredReason;
    if (!NOT_OCCURRED_REASONS.includes(reason)) {
      throw new ApiError(
        `notOccurredReason must be one of: ${NOT_OCCURRED_REASONS.join(", ")}`,
        400
      );
    }
    const explanation = cleanText(body.notOccurredExplanation, "notOccurredExplanation");
    if (reason === "OTHER" && (!explanation || explanation.length < MIN_OTHER_EXPLANATION)) {
      throw new ApiError(
        'notOccurredExplanation is required when notOccurredReason is "OTHER"',
        400
      );
    }
    return {
      occurred: false,
      feedback: {
        occurred: false,
        notOccurredReason: reason,
        notOccurredExplanation: explanation,
        rating: null,
        wasHelpful: null,
        wouldContinueMentoring: null,
        // Only meaningful when the meeting happened (DB CHECK
        // Feedback_wants_another_only_when_occurred).
        wantsAnotherMeeting: null,
        comment: cleanText(body.comment, "comment"),
      },
    };
  }

  // occurred === true — the short feedback form.
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    throw new ApiError(`rating must be an integer ${RATING_MIN}-${RATING_MAX}`, 400);
  }
  if (!HELPFULNESS.includes(body.wasHelpful)) {
    throw new ApiError(`wasHelpful must be one of: ${HELPFULNESS.join(", ")}`, 400);
  }

  // Part 2: BOTH participants answer "would you like another mentoring meeting
  // with this person?". Required on the occurred = true branch, from either role.
  // Kept nullable in the DB only so feedback rows created before this feature
  // stay valid; new submissions must carry a boolean.
  if (typeof body.wantsAnotherMeeting !== "boolean") {
    throw new ApiError("wantsAnotherMeeting (boolean) is required", 400);
  }

  // wouldContinueMentoring is a MENTEE-only question. Accept it only from a
  // mentee; silently ignore it for a mentor (never store it there — the DB
  // CHECK Feedback_continue_is_mentee_only would reject it anyway).
  let wouldContinueMentoring = null;
  if (role === PARTICIPANT_ROLE.MENTEE && body.wouldContinueMentoring != null) {
    if (!CONTINUE_INTEREST.includes(body.wouldContinueMentoring)) {
      throw new ApiError(
        `wouldContinueMentoring must be one of: ${CONTINUE_INTEREST.join(", ")}`,
        400
      );
    }
    wouldContinueMentoring = body.wouldContinueMentoring;
  }

  return {
    occurred: true,
    feedback: {
      occurred: true,
      notOccurredReason: null,
      notOccurredExplanation: null,
      rating,
      wasHelpful: body.wasHelpful,
      wouldContinueMentoring,
      wantsAnotherMeeting: body.wantsAnotherMeeting,
      comment: cleanText(body.comment, "comment"),
    },
  };
}

// ----------------------------------------------------------------------------
// Status rule — a pure function of the set of MeetingOutcomeConfirmation rows.
// ----------------------------------------------------------------------------
//   any participant answered "did not happen"  -> NOT_COMPLETED (both sides).
//       One "no" is decisive; the reason is already stored.
//   BOTH participants answered "happened"      -> Meeting COMPLETED,
//       Request FEEDBACK_COMPLETED (in this flow "happened" always arrives
//       together with that participant's feedback, so both-happened == both
//       feedback submitted).
//   only one side has answered "happened"      -> no change: stay MATCHED /
//       SCHEDULED so the request is never marked done on one voice alone; the
//       other side's POST_MEETING_CHECK stays outstanding.
function decideStatuses(outcomeRows, menteeId, mentorUserId) {
  const anyDidNotHappen = outcomeRows.some((r) => r.occurred === false);
  if (anyDidNotHappen) {
    return { meetingStatus: "NOT_COMPLETED", requestStatus: "NOT_COMPLETED" };
  }
  const ids = new Set(outcomeRows.map((r) => r.userId));
  if (ids.has(menteeId) && ids.has(mentorUserId)) {
    return { meetingStatus: "COMPLETED", requestStatus: "FEEDBACK_COMPLETED" };
  }
  return null; // wait for the other participant
}

// ----------------------------------------------------------------------------
// POST — record ONE participant's answer + feedback, then recompute status.
// ----------------------------------------------------------------------------
async function submitFeedback(rawMeetingId, rawActingUserId, body = {}) {
  const actingUserId = parseId(rawActingUserId, "actingUserId");
  const meeting = await loadMeetingOr404(rawMeetingId);
  const role = resolveRole(meeting, actingUserId); // 403 if not a participant

  if (meeting.scheduledEnd.getTime() > Date.now()) {
    throw new ApiError("The meeting has not ended yet", 409);
  }
  if (!OPEN_MEETING_STATUSES.includes(meeting.status)) {
    throw new ApiError(
      `Meeting ${meeting.id} is ${meeting.status}; feedback is not open for it`,
      409
    );
  }

  const { occurred, feedback } = normalizeSubmission(body, role);
  const p = participantsOf(meeting);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // 1. lifecycle input — one row per participant, unique on (meeting, user).
      await tx.meetingOutcomeConfirmation.create({
        data: {
          meetingId: meeting.id,
          userId: actingUserId,
          occurred,
          wantsReschedule: null, // this flow does not offer a no-show retry
        },
      });

      // 2. the dedicated structured feedback row — also unique per participant.
      await tx.feedback.create({
        data: {
          meetingId: meeting.id,
          authorId: actingUserId,
          authorRole: role,
          ...feedback,
        },
      });

      // 3. recompute Meeting + MentoringRequest status from BOTH answers.
      const outcomeRows = await tx.meetingOutcomeConfirmation.findMany({
        where: { meetingId: meeting.id },
        select: { userId: true, occurred: true },
      });
      const decision = decideStatuses(outcomeRows, p.menteeId, p.mentorUserId);
      if (decision) {
        await tx.meeting.updateMany({
          where: { id: meeting.id, status: { in: OPEN_MEETING_STATUSES } },
          data: { status: decision.meetingStatus },
        });
        await tx.mentoringRequest.updateMany({
          where: { id: meeting.request.id, status: { in: OPEN_REQUEST_STATUSES } },
          data: { status: decision.requestStatus },
        });
      }

      // 4. this participant's post-meeting nudges are no longer open actions:
      //    both the POST_MEETING_CHECK and any outstanding FEEDBACK_REMINDER
      //    (Part 3 — submitting feedback stops future reminders).
      await tx.notification.updateMany({
        where: {
          recipientId: actingUserId,
          meetingId: meeting.id,
          type: { in: ["POST_MEETING_CHECK", "FEEDBACK_REMINDER"] },
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      const mySubmission = await tx.feedback.findUnique({
        where: {
          meetingId_authorId: { meetingId: meeting.id, authorId: actingUserId },
        },
      });
      const fresh = await tx.meeting.findUnique({
        where: { id: meeting.id },
        include: MEETING_INCLUDE,
      });
      return contextShape(tx, fresh, role, actingUserId, mySubmission);
    });
  } catch (err) {
    // Unique violation on either row = this participant already submitted.
    if (err && err.code === "P2002") {
      throw new ApiError(
        "You have already submitted feedback for this meeting",
        409
      );
    }
    throw err;
  }

  // Post-commit ONLY. The mentee's Feedback + MeetingOutcomeConfirmation rows
  // are persisted and `result` is final. Fire the mentor thank-you email:
  //   * only on the MENTEE's submission, and only when SHE reported the meeting
  //     OCCURRED (occurred === true);
  //   * exactly once — a second submission by the same mentee hits the Feedback
  //     @@unique([meetingId, authorId]) guard above (P2002 -> 409) and never
  //     reaches this line, and there is no feedback-edit/re-submit endpoint, so
  //     no persisted "sent" flag is needed;
  //   * fire-and-forget — it cannot change feedback status, meeting status,
  //     request status, wantsAnotherMeeting, or whether this call succeeds.
  if (role === PARTICIPANT_ROLE.MENTEE && occurred === true) {
    dispatchMentorThankYou(meeting, p).catch((err) =>
      // eslint-disable-next-line no-console
      console.error("[email] mentor thank-you dispatch failed:", err && err.message)
    );
  }

  return result;
}

// Load the mentor's real email (MEETING_INCLUDE carries only fullName) and hand
// off to emailService. Isolated, read-only, post-commit; emailService swallows
// and logs every delivery failure.
async function dispatchMentorThankYou(meeting, p) {
  const mentorUser = await prisma.user.findUnique({
    where: { id: p.mentorUserId },
    select: { email: true, fullName: true },
  });
  if (!mentorUser || !mentorUser.email) return;
  await emailService.sendMentorThankYouEmail({
    mentor: { email: mentorUser.email, name: mentorUser.fullName || p.mentorName },
  });
}

// ----------------------------------------------------------------------------
// Lazy notification materialization (no scheduler).
// ----------------------------------------------------------------------------
// Called from the notification read model whenever a user touches it. For every
// meeting the user takes part in whose time has passed but which is still
// SCHEDULED / MATCHED, ensure a POST_MEETING_CHECK notification exists for BOTH
// participants (so the other side's item is ready the moment they log in too).
// Idempotent: one row per (recipient, meeting), enforced here by an existence
// check AND by the partial unique index Notification_post_meeting_check_uq
// (migration) as a hard backstop.
//
// A future background worker would run this same body for every meeting on a
// timer; nothing else would need to change.
async function materializeDuePostMeetingNotificationsForUser(rawUserId) {
  const userId = parseId(rawUserId, "userId");
  const now = new Date();

  const dueMeetings = await prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      scheduledEnd: { lt: now },
      request: {
        status: "MATCHED",
        OR: [
          { menteeId: userId },
          { mentorProfile: { userId } },
        ],
      },
    },
    include: MEETING_INCLUDE,
  });
  if (dueMeetings.length === 0) return { created: 0 };

  let created = 0;
  for (const meeting of dueMeetings) {
    const p = participantsOf(meeting);
    const when = { start: meeting.scheduledStart, end: meeting.scheduledEnd };
    const targets = [
      { recipientId: p.menteeId, otherName: p.mentorName },
      { recipientId: p.mentorUserId, otherName: p.menteeName },
    ];

    for (const target of targets) {
      const exists = await prisma.notification.findFirst({
        where: {
          recipientId: target.recipientId,
          meetingId: meeting.id,
          type: "POST_MEETING_CHECK",
        },
        select: { id: true },
      });
      if (exists) continue;
      try {
        await createNotifications(prisma, [
          {
            recipientId: target.recipientId,
            type: "POST_MEETING_CHECK",
            requestId: meeting.request.id,
            meetingId: meeting.id,
            payload: {
              mentorName: p.mentorName,
              menteeName: p.menteeName,
              when,
            },
          },
        ]);
        created += 1;
      } catch (err) {
        // Lost the race to the partial unique index — the row now exists, fine.
        if (!err || err.code !== "P2002") throw err;
      }
    }
  }
  return { created };
}

// ----------------------------------------------------------------------------
// Lazy FEEDBACK_REMINDER materialization (Part 3 — "remind every 2 days until
// the feedback is completed", per participant, independently).
// ----------------------------------------------------------------------------
// Same posture as materializeDuePostMeetingNotificationsForUser: no scheduler,
// so reminders are created when a participant touches the notification read
// model (bell poll / open). For every meeting the acting user takes part in
// whose time has passed and whose request still owes feedback, EACH participant
// who has not submitted their own Feedback row gets at most one new reminder,
// and only once >= 2 days have passed since their last nudge (their previous
// FEEDBACK_REMINDER, else their POST_MEETING_CHECK, else the meeting end).
//
// Guarantees:
//   * only participants missing feedback are reminded (feedback authors are skipped);
//   * mentor and mentee are evaluated separately;
//   * consecutive reminders are >= FEEDBACK_REMINDER_INTERVAL_MS apart;
//   * repeated calls inside a window create nothing (the anchor check + a
//     pre-insert re-check);
//   * submitting feedback stops future reminders (submitFeedback marks the
//     outstanding ones read AND the feedback-author filter below excludes the
//     meeting from then on).
// A true "fire exactly every 48h with no user activity" guarantee would need a
// background worker calling this on a timer for every user — out of scope here.
async function materializeDueFeedbackRemindersForUser(rawUserId) {
  const userId = parseId(rawUserId, "userId");
  const now = new Date();
  const windowStart = new Date(now.getTime() - FEEDBACK_REMINDER_INTERVAL_MS);

  const dueMeetings = await prisma.meeting.findMany({
    where: {
      scheduledEnd: { lt: now },
      // Feedback is still meaningful: SCHEDULED (nobody / one side answered) or
      // NOT_COMPLETED (one "did not happen"; the other side may still owe an
      // answer). COMPLETED / CANCELLED / RESCHEDULED are done or dead.
      status: { in: ["SCHEDULED", "NOT_COMPLETED"] },
      request: {
        status: { in: ["MATCHED", "NOT_COMPLETED"] },
        OR: [{ menteeId: userId }, { mentorProfile: { userId } }],
      },
    },
    include: { ...MEETING_INCLUDE, feedback: { select: { authorId: true } } },
  });
  if (dueMeetings.length === 0) return { created: 0 };

  let created = 0;
  for (const meeting of dueMeetings) {
    const p = participantsOf(meeting);
    const submitted = new Set(meeting.feedback.map((f) => f.authorId));
    const when = { start: meeting.scheduledStart, end: meeting.scheduledEnd };

    const candidates = [
      { recipientId: p.menteeId, role: PARTICIPANT_ROLE.MENTEE },
      { recipientId: p.mentorUserId, role: PARTICIPANT_ROLE.MENTOR },
    ];
    for (const cand of candidates) {
      if (submitted.has(cand.recipientId)) continue; // already gave feedback

      const lastReminder = await prisma.notification.findFirst({
        where: {
          recipientId: cand.recipientId,
          meetingId: meeting.id,
          type: "FEEDBACK_REMINDER",
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      let anchor = lastReminder ? lastReminder.createdAt : null;
      if (!anchor) {
        const check = await prisma.notification.findFirst({
          where: {
            recipientId: cand.recipientId,
            meetingId: meeting.id,
            type: "POST_MEETING_CHECK",
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        anchor = check ? check.createdAt : meeting.scheduledEnd;
      }
      if (now.getTime() - anchor.getTime() < FEEDBACK_REMINDER_INTERVAL_MS) continue;

      // Shrink the concurrent double-poll window: bail if a reminder for this
      // (recipient, meeting) already landed inside the current interval.
      const recent = await prisma.notification.findFirst({
        where: {
          recipientId: cand.recipientId,
          meetingId: meeting.id,
          type: "FEEDBACK_REMINDER",
          createdAt: { gt: windowStart },
        },
        select: { id: true },
      });
      if (recent) continue;

      await createNotifications(prisma, [
        {
          recipientId: cand.recipientId,
          type: "FEEDBACK_REMINDER",
          requestId: meeting.request.id,
          meetingId: meeting.id,
          payload: {
            mentorName: p.mentorName,
            menteeName: p.menteeName,
            when,
            role: cand.role,
          },
        },
      ]);
      created += 1;
    }
  }
  return { created };
}

// ----------------------------------------------------------------------------
// startAnotherMeeting — Part 2: once BOTH participants completed feedback and
// BOTH said they want another meeting, either of them may open the next one.
// ----------------------------------------------------------------------------
// This deliberately does NOT touch the scheduling state machine. The previous
// MentoringRequest stays in its terminal state; "another meeting" is a fresh
// MentoringRequest for the same (mentee, mentorProfile) pair, created through the
// existing requestService.createRequest at the normal initial status. It then
// flows through the unchanged propose -> select machine.
//
//   403  caller is not a participant of this meeting
//   409  the pair has not both said YES yet
//   200  { request, created:false }  a follow-up request is already open (idempotent)
//   201-ish { request, created:true } a new WAITING_FOR_MENTOR_SLOTS request
async function startAnotherMeeting(rawMeetingId, rawActingUserId) {
  const actingUserId = parseId(rawActingUserId, "actingUserId");
  const meeting = await loadMeetingOr404(rawMeetingId);
  resolveRole(meeting, actingUserId); // 403 if not a participant

  const menteeId = meeting.request.menteeId;
  const mentorUserId = meeting.request.mentorProfile.userId;
  const mentorProfileId = meeting.request.mentorProfileId;
  const mentorName = meeting.request.mentorProfile.user
    ? meeting.request.mentorProfile.user.fullName
    : null;
  const menteeName = meeting.request.mentee ? meeting.request.mentee.fullName : null;

  const rows = await prisma.feedback.findMany({
    where: { meetingId: meeting.id },
    select: { authorId: true, occurred: true, wantsAnotherMeeting: true },
  });
  const wants = (uid) => {
    const r = rows.find((x) => x.authorId === uid);
    return !!(r && r.occurred === true && r.wantsAnotherMeeting === true);
  };
  if (!(wants(menteeId) && wants(mentorUserId))) {
    throw new ApiError(
      "Another meeting can be arranged only after both participants completed feedback and both chose to meet again",
      409
    );
  }

  // Idempotent + concurrency-safe: a Postgres transaction-scoped advisory lock
  // keyed on (menteeId, mentorProfileId) serializes two "start another" calls for
  // the same pair (e.g. mentor and mentee both clicking at once), so exactly one
  // fresh request is created and the other call returns it. This inlines the
  // same effect as requestService.createRequest (row + the two opening
  // notifications) rather than nesting transactions.
  return prisma.$transaction(async (tx) => {
    // $executeRaw (not $queryRaw) — pg_advisory_xact_lock returns void, which
    // $queryRaw cannot deserialize.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${menteeId}::int4, ${mentorProfileId}::int4)`;

    const existing = await tx.mentoringRequest.findFirst({
      where: {
        menteeId,
        mentorProfileId,
        status: { notIn: requestService.CLOSED_REQUEST_STATUSES },
      },
      orderBy: { id: "desc" },
      include: requestService.REQUEST_INCLUDE,
    });
    if (existing) return { request: existing, created: false };

    const request = await tx.mentoringRequest.create({
      data: { menteeId, mentorProfileId, status: "WAITING_FOR_MENTOR_SLOTS" },
      include: requestService.REQUEST_INCLUDE,
    });
    await createNotifications(tx, [
      {
        recipientId: menteeId,
        type: "MENTORING_REQUEST_SENT",
        requestId: request.id,
        payload: { mentorName },
      },
      {
        recipientId: mentorUserId,
        type: "MENTORING_REQUEST_RECEIVED",
        requestId: request.id,
        payload: { menteeName },
      },
    ]);
    return { request, created: true };
  });
}

module.exports = {
  PARTICIPANT_ROLE,
  NOT_OCCURRED_REASONS,
  HELPFULNESS,
  CONTINUE_INTEREST,
  RATING_MIN,
  RATING_MAX,
  FEEDBACK_REMINDER_INTERVAL_MS,
  getFeedbackContext,
  submitFeedback,
  decideStatuses,
  startAnotherMeeting,
  materializeDuePostMeetingNotificationsForUser,
  materializeDueFeedbackRemindersForUser,
};
