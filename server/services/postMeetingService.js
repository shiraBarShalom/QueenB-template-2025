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

// The presentational + gating shape both the GET and the POST return.
function contextShape(meeting, role, mySubmission) {
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
          comment: mySubmission.comment,
          submittedAt: mySubmission.submittedAt,
        }
      : null,
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

  return contextShape(meeting, role, mySubmission);
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

  try {
    return await prisma.$transaction(async (tx) => {
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

      // 4. this participant's POST_MEETING_CHECK is no longer an open action.
      await tx.notification.updateMany({
        where: {
          recipientId: actingUserId,
          meetingId: meeting.id,
          type: "POST_MEETING_CHECK",
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
      return contextShape(fresh, role, mySubmission);
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

module.exports = {
  PARTICIPANT_ROLE,
  NOT_OCCURRED_REASONS,
  HELPFULNESS,
  CONTINUE_INTEREST,
  RATING_MIN,
  RATING_MAX,
  getFeedbackContext,
  submitFeedback,
  decideStatuses,
  materializeDuePostMeetingNotificationsForUser,
};
