/* eslint-disable no-console */
// ============================================================================
// Manual verification for the post-meeting flow (Part: "lifecycle AFTER a
// scheduled meeting").
// ============================================================================
// Same style as verify-scheduling.js / verify-notifications.js: no test runner,
// isolated data (emails prefixed "pmtest."), drives the REAL services, asserts
// DB state, cleans up before and after.
//
// Run:  node scripts/verify-post-meeting.js
// Exit: 0 = all passed, 1 = at least one failure.
// ============================================================================

const prisma = require("../prismaClient");
const sched = require("../services/schedulingService");
const notif = require("../services/notificationService");
const pm = require("../services/postMeetingService");

let passed = 0;
let failed = 0;
const ok = (n) => (passed++, console.log(`  ✓ ${n}`));
const bad = (n, d) => (failed++, console.log(`  ✗ ${n}\n      ${d}`));
const assert = (n, c, d = "") => (c ? ok(n) : bad(n, d || "assertion false"));

async function expectStatus(name, thunk, status) {
  try {
    await thunk();
    bad(name, `expected ${status}, resolved instead`);
  } catch (e) {
    e && e.status === status
      ? ok(name)
      : bad(name, `expected ${status}, got ${e && e.status} (${e && e.message})`);
  }
}

const HOUR = 3600 * 1000;
const futureSlots = (n, base = Date.now() + 24 * HOUR) =>
  Array.from({ length: n }, (_, i) => ({
    startTime: new Date(base + i * HOUR).toISOString(),
    endTime: new Date(base + i * HOUR + 30 * 60 * 1000).toISOString(),
  }));

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "pmtest." } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) return;
  const profiles = await prisma.mentorProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);
  const requests = await prisma.mentoringRequest.findMany({
    where: { OR: [{ menteeId: { in: userIds } }, { mentorProfileId: { in: profileIds } }] },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);
  const meetings = await prisma.meeting.findMany({
    where: { requestId: { in: requestIds } },
    select: { id: true },
  });
  const meetingIds = meetings.map((m) => m.id);
  const rounds = await prisma.schedulingRound.findMany({
    where: { requestId: { in: requestIds } },
    select: { id: true },
  });
  const roundIds = rounds.map((r) => r.id);

  await prisma.notification.deleteMany({
    where: { OR: [{ recipientId: { in: userIds } }, { requestId: { in: requestIds } }] },
  });
  await prisma.feedback.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.meetingOutcomeConfirmation.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.attendanceConfirmation.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.meeting.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.offeredSlot.deleteMany({ where: { schedulingRoundId: { in: roundIds } } });
  await prisma.schedulingRound.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.mentoringRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.mentorProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

// Drive a fresh request all the way to MATCHED, then age its Meeting into the
// past so the post-meeting flow is open. Returns { meetingId, requestId }.
async function matchedPastMeeting(menteeId, mentorUserId, mentorProfileId) {
  const req = await prisma.mentoringRequest.create({
    data: { menteeId, mentorProfileId, status: "WAITING_FOR_MENTOR_SLOTS" },
  });
  await sched.proposeSlots(req.id, mentorUserId, futureSlots(2));
  const round = await prisma.schedulingRound.findFirst({
    where: { requestId: req.id },
    orderBy: { roundNumber: "desc" },
    include: { offeredSlots: true },
  });
  await sched.selectSlot(req.id, menteeId, round.offeredSlots[0].id);
  const meeting = await prisma.meeting.findFirst({ where: { requestId: req.id } });
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      scheduledStart: new Date(Date.now() - 3 * HOUR),
      scheduledEnd: new Date(Date.now() - 2 * HOUR),
    },
  });
  return { meetingId: meeting.id, requestId: req.id };
}

const meetingStatus = (id) =>
  prisma.meeting.findUnique({ where: { id }, select: { status: true } }).then((m) => m.status);
const requestStatus = (id) =>
  prisma.mentoringRequest.findUnique({ where: { id }, select: { status: true } }).then((r) => r.status);

// --- Part 2 / Part 3 helpers ------------------------------------------------
const DAY = 24 * HOUR;

// occurred=true feedback that always carries the now-required wantsAnotherMeeting.
const submitYes = (meetingId, userId, { rating = 5, wasHelpful = "YES", wantsAnotherMeeting, wouldContinueMentoring } = {}) =>
  pm.submitFeedback(meetingId, userId, {
    actingUserId: userId,
    occurred: true,
    rating,
    wasHelpful,
    ...(wouldContinueMentoring ? { wouldContinueMentoring } : {}),
    wantsAnotherMeeting,
  });

// Drive a fresh request to a past MATCHED meeting whose scheduledEnd is
// `endDaysAgo` days in the past (default just over an hour, like matchedPastMeeting).
async function matchedMeetingEndedDaysAgo(menteeId, mentorUserId, mentorProfileId, endDaysAgo = 0) {
  const { meetingId, requestId } = await matchedPastMeeting(menteeId, mentorUserId, mentorProfileId);
  if (endDaysAgo > 0) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        scheduledStart: new Date(Date.now() - (endDaysAgo * DAY + HOUR)),
        scheduledEnd: new Date(Date.now() - endDaysAgo * DAY),
      },
    });
  }
  return { meetingId, requestId };
}

// Push a notification's createdAt into the past to simulate elapsed time.
const ageNotification = (id, msAgo) =>
  prisma.notification.update({ where: { id }, data: { createdAt: new Date(Date.now() - msAgo) } });

const remindersFor = (userId, meetingId) =>
  prisma.notification.count({ where: { recipientId: userId, meetingId, type: "FEEDBACK_REMINDER" } });

async function main() {
  await cleanup();

  const mentorUser = await prisma.user.create({
    data: { email: "pmtest.mentor@verify.local", passwordHash: "x", fullName: "Pia Mentor" },
  });
  const menteeUser = await prisma.user.create({
    data: { email: "pmtest.mentee@verify.local", passwordHash: "x", fullName: "Mona Mentee" },
  });
  const strangerUser = await prisma.user.create({
    data: { email: "pmtest.stranger@verify.local", passwordHash: "x", fullName: "Sam Stranger" },
  });
  const mentorProfile = await prisma.mentorProfile.create({
    data: { userId: mentorUser.id, background: "bg", meetingCapacity: 10, meetingDurationMinutes: 30 },
  });
  const M = mentorUser.id;
  const E = menteeUser.id;
  const S = strangerUser.id;

  // Isolated pair for the Part 2 (another meeting) + Part 3 (reminder) sections,
  // so leftover MATCHED requests from the earlier sections do not look like an
  // "already open follow-up" for this pair (findOpenRequest is pair-scoped).
  const mentor2User = await prisma.user.create({
    data: { email: "pmtest.mentor2@verify.local", passwordHash: "x", fullName: "Pola Pair" },
  });
  const mentee2User = await prisma.user.create({
    data: { email: "pmtest.mentee2@verify.local", passwordHash: "x", fullName: "Cara Continue" },
  });
  const mentorProfile2 = await prisma.mentorProfile.create({
    data: { userId: mentor2User.id, background: "bg", meetingCapacity: 10, meetingDurationMinutes: 30 },
  });
  const M2 = mentor2User.id;
  const E2 = mentee2User.id;

  // A THIRD clean pair, used only by section [K]. startAnotherMeeting's
  // idempotency guard is findOpenRequest (pair-scoped), so [K] needs a pair with
  // no lingering non-terminal request from any other section.
  const mentor3User = await prisma.user.create({
    data: { email: "pmtest.mentor3@verify.local", passwordHash: "x", fullName: "Gita Gate" },
  });
  const mentee3User = await prisma.user.create({
    data: { email: "pmtest.mentee3@verify.local", passwordHash: "x", fullName: "Hana Hello" },
  });
  const mentorProfile3 = await prisma.mentorProfile.create({
    data: { userId: mentor3User.id, background: "bg", meetingCapacity: 10, meetingDurationMinutes: 30 },
  });
  const M3 = mentor3User.id;
  const E3 = mentee3User.id;

  // === A. Meeting time has passed -> both participants can access the flow ===
  console.log("\n[A] Meeting ended -> post-meeting flow open for both sides");
  {
    const { meetingId } = await matchedPastMeeting(E, M, mentorProfile.id);

    const menteeCtx = await pm.getFeedbackContext(meetingId, E);
    const mentorCtx = await pm.getFeedbackContext(meetingId, M);
    assert("mentee context: meetingEnded && canSubmit && role MENTEE",
      menteeCtx.meetingEnded && menteeCtx.canSubmit && menteeCtx.role === "MENTEE");
    assert("mentor context: meetingEnded && canSubmit && role MENTOR",
      mentorCtx.meetingEnded && mentorCtx.canSubmit && mentorCtx.role === "MENTOR");
    assert("reasons list is served to the client", Array.isArray(menteeCtx.reasons) && menteeCtx.reasons.includes("OTHER"));

    // Notification materialization (no scheduler): reading the bell creates the
    // POST_MEETING_CHECK for BOTH participants, exactly once.
    await notif.unreadCountForUser(E);
    let menteeChecks = await prisma.notification.count({
      where: { recipientId: E, meetingId, type: "POST_MEETING_CHECK" },
    });
    let mentorChecks = await prisma.notification.count({
      where: { recipientId: M, meetingId, type: "POST_MEETING_CHECK" },
    });
    assert("POST_MEETING_CHECK created for mentee", menteeChecks === 1);
    assert("POST_MEETING_CHECK created for mentor (from the mentee's sweep)", mentorChecks === 1);

    await notif.listForUser(E);
    await notif.unreadCountForUser(M);
    menteeChecks = await prisma.notification.count({
      where: { recipientId: E, meetingId, type: "POST_MEETING_CHECK" },
    });
    mentorChecks = await prisma.notification.count({
      where: { recipientId: M, meetingId, type: "POST_MEETING_CHECK" },
    });
    assert("no duplicate POST_MEETING_CHECK after repeated sweeps", menteeChecks === 1 && mentorChecks === 1);
  }

  // === B + C. Both say "happened" -> stored separately, request COMPLETED ====
  console.log("\n[B+C] Both attended -> separate rows, no overwrite, COMPLETED");
  {
    const { meetingId, requestId } = await matchedPastMeeting(E, M, mentorProfile.id);

    await pm.submitFeedback(meetingId, E, {
      actingUserId: E,
      occurred: true,
      rating: 5,
      wasHelpful: "YES",
      wouldContinueMentoring: "YES",
      wantsAnotherMeeting: true,
      comment: "Really useful session.",
    });
    assert("after mentee-only submit: meeting still SCHEDULED", (await meetingStatus(meetingId)) === "SCHEDULED");
    assert("after mentee-only submit: request still MATCHED (not marked done on one voice)",
      (await requestStatus(requestId)) === "MATCHED");

    const midCtx = await pm.getFeedbackContext(meetingId, E);
    assert("mentee ctx now alreadySubmitted && !canSubmit", midCtx.alreadySubmitted && !midCtx.canSubmit);
    const mentorMid = await pm.getFeedbackContext(meetingId, M);
    assert("mentor ctx still canSubmit (independent)", mentorMid.canSubmit && !mentorMid.alreadySubmitted);
    assert("mentee ctx: myAnswer YES, otherSubmitted false, cannot start another yet",
      midCtx.continuation.myAnswer === true &&
      midCtx.continuation.otherSubmitted === false &&
      midCtx.continuation.bothWantAnother === false &&
      midCtx.continuation.canStartAnother === false);

    await pm.submitFeedback(meetingId, M, {
      actingUserId: M,
      occurred: true,
      rating: 4,
      wasHelpful: "SOMEWHAT",
      // mentor sends wouldContinueMentoring -> must be ignored, never stored
      wouldContinueMentoring: "YES",
      wantsAnotherMeeting: true,
      comment: "Good chat.",
    });

    const rows = await prisma.feedback.findMany({
      where: { meetingId }, orderBy: { authorRole: "asc" },
    });
    assert("two Feedback rows — one per participant", rows.length === 2);
    const menteeRow = rows.find((r) => r.authorId === E);
    const mentorRow = rows.find((r) => r.authorId === M);
    assert("mentee row: role MENTEE, rating 5, wasHelpful YES, continue YES, wantsAnother true",
      menteeRow.authorRole === "MENTEE" && menteeRow.rating === 5 &&
      menteeRow.wasHelpful === "YES" && menteeRow.wouldContinueMentoring === "YES" &&
      menteeRow.wantsAnotherMeeting === true);
    assert("mentor row: role MENTOR, rating 4, wasHelpful SOMEWHAT, continue NULL (mentee-only), wantsAnother true",
      mentorRow.authorRole === "MENTOR" && mentorRow.rating === 4 &&
      mentorRow.wasHelpful === "SOMEWHAT" && mentorRow.wouldContinueMentoring === null &&
      mentorRow.wantsAnotherMeeting === true);
    assert("mentee row NOT overwritten by mentor submit", menteeRow.comment === "Really useful session.");

    const outcomes = await prisma.meetingOutcomeConfirmation.findMany({ where: { meetingId } });
    assert("two MeetingOutcomeConfirmation rows, both occurred=true",
      outcomes.length === 2 && outcomes.every((o) => o.occurred === true));
    assert("both attended -> Meeting COMPLETED", (await meetingStatus(meetingId)) === "COMPLETED");
    assert("both attended + both feedback -> Request FEEDBACK_COMPLETED",
      (await requestStatus(requestId)) === "FEEDBACK_COMPLETED");
  }

  // === D. Meeting did NOT happen -> reason stored, NOT_COMPLETED ============
  console.log("\n[D] Did not happen -> reason required, optional note, NOT_COMPLETED");
  {
    const { meetingId, requestId } = await matchedPastMeeting(E, M, mentorProfile.id);

    await expectStatus("occurred=false with no reason -> 400",
      () => pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: false }), 400);

    await pm.submitFeedback(meetingId, E, {
      actingUserId: E,
      occurred: false,
      notOccurredReason: "OTHER_PARTY_NO_SHOW",
      notOccurredExplanation: "Waited 20 minutes, no one joined.",
    });
    const row = await prisma.feedback.findFirst({ where: { meetingId, authorId: E } });
    assert("stored reason OTHER_PARTY_NO_SHOW + optional explanation",
      row.occurred === false && row.notOccurredReason === "OTHER_PARTY_NO_SHOW" &&
      row.notOccurredExplanation === "Waited 20 minutes, no one joined." &&
      row.rating === null && row.wasHelpful === null);
    assert("one 'did not happen' voice -> Meeting NOT_COMPLETED", (await meetingStatus(meetingId)) === "NOT_COMPLETED");
    assert("one 'did not happen' voice -> Request NOT_COMPLETED", (await requestStatus(requestId)) === "NOT_COMPLETED");

    // predefined reason without explanation is fine
    const second = await matchedPastMeeting(E, M, mentorProfile.id);
    await pm.submitFeedback(second.meetingId, M, {
      actingUserId: M,
      occurred: false,
      notOccurredReason: "TECHNICAL_ISSUE",
    });
    const r2 = await prisma.feedback.findFirst({ where: { meetingId: second.meetingId, authorId: M } });
    assert("predefined reason with no explanation is accepted",
      r2.notOccurredReason === "TECHNICAL_ISSUE" && r2.notOccurredExplanation === null);
  }

  // === E. "OTHER" reason -> free text required/validated ===================
  console.log("\n[E] OTHER reason requires free text");
  {
    const { meetingId } = await matchedPastMeeting(E, M, mentorProfile.id);
    await expectStatus("OTHER with no explanation -> 400",
      () => pm.submitFeedback(meetingId, E, {
        actingUserId: E, occurred: false, notOccurredReason: "OTHER",
      }), 400);
    await expectStatus("OTHER with blank explanation -> 400",
      () => pm.submitFeedback(meetingId, E, {
        actingUserId: E, occurred: false, notOccurredReason: "OTHER", notOccurredExplanation: "   ",
      }), 400);
    await pm.submitFeedback(meetingId, E, {
      actingUserId: E, occurred: false, notOccurredReason: "OTHER",
      notOccurredExplanation: "Family emergency came up.",
    });
    const row = await prisma.feedback.findFirst({ where: { meetingId, authorId: E } });
    assert("OTHER + explanation stored", row.notOccurredReason === "OTHER" && row.notOccurredExplanation === "Family emergency came up.");
  }

  // === F. Duplicate submission blocked ===================================
  console.log("\n[F] Duplicate submission by the same participant");
  {
    const { meetingId } = await matchedPastMeeting(E, M, mentorProfile.id);
    await pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 3, wasHelpful: "NO", wantsAnotherMeeting: false });
    await expectStatus("second submit by the same participant -> 409",
      () => pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 4, wasHelpful: "YES", wantsAnotherMeeting: false }), 409);
    const rows = await prisma.feedback.count({ where: { meetingId, authorId: E } });
    assert("still exactly one Feedback row for that participant", rows === 1);

    // concurrent double submit: exactly one wins
    const c = await matchedPastMeeting(E, M, mentorProfile.id);
    const results = await Promise.allSettled([
      pm.submitFeedback(c.meetingId, E, { actingUserId: E, occurred: true, rating: 5, wasHelpful: "YES", wantsAnotherMeeting: true }),
      pm.submitFeedback(c.meetingId, E, { actingUserId: E, occurred: true, rating: 1, wasHelpful: "NO", wantsAnotherMeeting: false }),
    ]);
    const fulfilled = results.filter((x) => x.status === "fulfilled").length;
    assert("concurrent double submit -> exactly one succeeds", fulfilled === 1);
    assert("concurrent double submit -> exactly one Feedback row",
      (await prisma.feedback.count({ where: { meetingId: c.meetingId, authorId: E } })) === 1);
  }

  // === G. Unauthorized user cannot read or submit ========================
  console.log("\n[G] Non-participant is blocked (403)");
  {
    const { meetingId } = await matchedPastMeeting(E, M, mentorProfile.id);
    await expectStatus("stranger GET context -> 403", () => pm.getFeedbackContext(meetingId, S), 403);
    await expectStatus("stranger POST feedback -> 403",
      () => pm.submitFeedback(meetingId, S, { actingUserId: S, occurred: true, rating: 5, wasHelpful: "YES" }), 403);
    assert("no Feedback row created by the stranger",
      (await prisma.feedback.count({ where: { meetingId, authorId: S } })) === 0);
  }

  // === H. Cannot submit before the meeting has ended =====================
  console.log("\n[H] Feedback closed until the meeting time passes");
  {
    const req = await prisma.mentoringRequest.create({
      data: { menteeId: E, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" },
    });
    await sched.proposeSlots(req.id, M, futureSlots(2));
    const round = await prisma.schedulingRound.findFirst({
      where: { requestId: req.id }, orderBy: { roundNumber: "desc" }, include: { offeredSlots: true },
    });
    await sched.selectSlot(req.id, E, round.offeredSlots[0].id);
    const meeting = await prisma.meeting.findFirst({ where: { requestId: req.id } });
    const ctx = await pm.getFeedbackContext(meeting.id, E);
    assert("future meeting: !meetingEnded && !canSubmit", !ctx.meetingEnded && !ctx.canSubmit);
    await expectStatus("submit before meeting ended -> 409",
      () => pm.submitFeedback(meeting.id, E, { actingUserId: E, occurred: true, rating: 5, wasHelpful: "YES" }), 409);

    // Clean up this deliberately-future meeting so it does not occupy the
    // mentor's calendar for a later section's propose (mentor double-booking).
    await sched.mentorCancel(req.id, M); // -> request + meeting CANCELLED
  }

  // === I. rating bounds ================================================
  console.log("\n[I] rating must be 1..5");
  {
    const { meetingId } = await matchedPastMeeting(E, M, mentorProfile.id);
    await expectStatus("rating 0 -> 400",
      () => pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 0, wasHelpful: "YES" }), 400);
    await expectStatus("rating 6 -> 400",
      () => pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 6, wasHelpful: "YES" }), 400);
    await expectStatus("occurred=true, missing wasHelpful -> 400",
      () => pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 3 }), 400);
  }

  // === J. Part 2 — wantsAnotherMeeting is required + per-participant =========
  console.log("\n[J] wantsAnotherMeeting: required on occurred=true, stored per participant");
  {
    const { meetingId } = await matchedPastMeeting(E2, M2, mentorProfile2.id);
    await expectStatus("occurred=true without wantsAnotherMeeting -> 400",
      () => pm.submitFeedback(meetingId, E2, { actingUserId: E2, occurred: true, rating: 4, wasHelpful: "YES" }), 400);

    await submitYes(meetingId, E2, { rating: 4, wantsAnotherMeeting: true });
    const row = await prisma.feedback.findFirst({ where: { meetingId, authorId: E2 } });
    assert("mentee's wantsAnotherMeeting stored = true", row.wantsAnotherMeeting === true);

    const ctx = await pm.getFeedbackContext(meetingId, E2);
    assert("continuation: myAnswer true, other not submitted, not startable",
      ctx.continuation.myAnswer === true &&
      ctx.continuation.otherSubmitted === false &&
      ctx.continuation.bothWantAnother === false &&
      ctx.continuation.canStartAnother === false);

    // occurred=false -> wantsAnotherMeeting is NULL (DB CHECK + service)
    const nd = await matchedPastMeeting(E2, M2, mentorProfile2.id);
    await pm.submitFeedback(nd.meetingId, M2, { actingUserId: M2, occurred: false, notOccurredReason: "TECHNICAL_ISSUE" });
    const ndRow = await prisma.feedback.findFirst({ where: { meetingId: nd.meetingId, authorId: M2 } });
    assert("occurred=false -> wantsAnotherMeeting is NULL", ndRow.wantsAnotherMeeting === null);
  }

  // === K. Part 2 — another meeting only when BOTH said YES =================
  // Uses the dedicated E3/M3/mentorProfile3 pair so findOpenRequest (pair-scoped)
  // sees only requests this section creates.
  console.log("\n[K] startAnotherMeeting is gated on mentor YES AND mentee YES");

  // fresh past MATCHED meeting with both feedback rows submitted at the given
  // answers -> the request ends FEEDBACK_COMPLETED (terminal), not "open".
  async function pairBothSubmitted(mentorWants, menteeWants) {
    const { meetingId, requestId } = await matchedPastMeeting(E3, M3, mentorProfile3.id);
    await submitYes(meetingId, E3, { wantsAnotherMeeting: menteeWants });
    await submitYes(meetingId, M3, { wantsAnotherMeeting: mentorWants });
    return { meetingId, requestId };
  }
  const openFollowUp = () =>
    prisma.mentoringRequest.findFirst({
      where: {
        menteeId: E3,
        mentorProfileId: mentorProfile3.id,
        status: { notIn: ["CANCELLED", "REJECTED", "COMPLETED", "FEEDBACK_COMPLETED", "NOT_COMPLETED"] },
      },
    });

  {
    // case 4 / 12: mentor YES + mentee YES -> a fresh request opens, old stays terminal
    const { meetingId, requestId } = await pairBothSubmitted(true, true);
    assert("both attended + both feedback -> old request FEEDBACK_COMPLETED",
      (await requestStatus(requestId)) === "FEEDBACK_COMPLETED");

    const preCtx = await pm.getFeedbackContext(meetingId, E3);
    assert("both YES -> continuation.bothWantAnother && canStartAnother && no followUp yet",
      preCtx.continuation.bothWantAnother === true &&
      preCtx.continuation.canStartAnother === true &&
      preCtx.continuation.followUpRequestId == null);

    const started = await pm.startAnotherMeeting(meetingId, E3);
    assert("mentor YES + mentee YES -> new WAITING_FOR_MENTOR_SLOTS request for the same pair",
      started.created === true &&
      started.request.status === "WAITING_FOR_MENTOR_SLOTS" &&
      started.request.menteeId === E3 &&
      started.request.mentorProfileId === mentorProfile3.id &&
      started.request.id !== requestId);
    assert("old request still terminal FEEDBACK_COMPLETED (scheduling state machine untouched)",
      (await requestStatus(requestId)) === "FEEDBACK_COMPLETED");

    const afterCtx = await pm.getFeedbackContext(meetingId, M3);
    assert("after start: followUpRequestId set, canStartAnother false",
      afterCtx.continuation.followUpRequestId === started.request.id &&
      afterCtx.continuation.canStartAnother === false);

    // idempotent: the OTHER participant clicking returns the same request
    const dup = await pm.startAnotherMeeting(meetingId, M3);
    assert("idempotent: second call -> same request, created:false",
      dup.created === false && dup.request.id === started.request.id);
    await sched.withdraw(started.request.id, E3); // clean up the follow-up

    // concurrent: both participants click at once -> at most one 'created'
    const c = await pairBothSubmitted(true, true);
    const race = await Promise.allSettled([
      pm.startAnotherMeeting(c.meetingId, E3),
      pm.startAnotherMeeting(c.meetingId, M3),
    ]);
    const createdCount = race.filter((r) => r.status === "fulfilled" && r.value.created === true).length;
    assert("concurrent startAnotherMeeting -> both resolve, at most one 'created'",
      race.every((r) => r.status === "fulfilled") && createdCount <= 1);
    assert("concurrent startAnotherMeeting -> exactly one open follow-up for the pair",
      (await prisma.mentoringRequest.count({
        where: { menteeId: E3, mentorProfileId: mentorProfile3.id, status: "WAITING_FOR_MENTOR_SLOTS" },
      })) === 1);
    const leftover = await openFollowUp();
    if (leftover) await sched.withdraw(leftover.id, E3); // clean up
  }

  {
    // case 5: mentor YES + mentee NO -> 409
    const { meetingId } = await pairBothSubmitted(true, false);
    const ctx = await pm.getFeedbackContext(meetingId, E3);
    assert("mentor YES + mentee NO -> bothWantAnother false, canStartAnother false",
      ctx.continuation.bothWantAnother === false && ctx.continuation.canStartAnother === false);
    await expectStatus("mentor YES + mentee NO -> startAnotherMeeting 409",
      () => pm.startAnotherMeeting(meetingId, E3), 409);
  }
  {
    // case 6: mentor NO + mentee YES -> 409
    const { meetingId } = await pairBothSubmitted(false, true);
    await expectStatus("mentor NO + mentee YES -> startAnotherMeeting 409",
      () => pm.startAnotherMeeting(meetingId, M3), 409);
  }
  {
    // case 7: both NO -> 409
    const { meetingId } = await pairBothSubmitted(false, false);
    await expectStatus("both NO -> startAnotherMeeting 409",
      () => pm.startAnotherMeeting(meetingId, E3), 409);
    // non-participant blocked regardless
    await expectStatus("stranger -> startAnotherMeeting 403",
      () => pm.startAnotherMeeting(meetingId, S), 403);
  }

  // === L. Part 3 — feedback reminders (lazy, >= 2 days apart, per participant) ==
  // Isolated pair E2/M2/mentorProfile2 — the only meeting for that pair that is
  // more than 2 days past is the one created here.
  console.log("\n[L] FEEDBACK_REMINDER: eligibility, no dup < 2d, next after 2d, stops on submit");
  {
    const { meetingId } = await matchedMeetingEndedDaysAgo(E2, M2, mentorProfile2.id, 3);

    // 8. missing feedback + meeting ended > 2 days ago -> one reminder each side
    const first = await pm.materializeDueFeedbackRemindersForUser(E2);
    assert("sweep creates a reminder for BOTH participants who owe feedback", first.created === 2);
    assert("mentee has 1 FEEDBACK_REMINDER", (await remindersFor(E2, meetingId)) === 1);
    assert("mentor has 1 FEEDBACK_REMINDER", (await remindersFor(M2, meetingId)) === 1);

    // 9. not duplicated when swept again inside the 2-day window
    const again = await pm.materializeDueFeedbackRemindersForUser(E2);
    assert("re-sweep within 2 days creates nothing", again.created === 0);
    assert("still exactly 1 reminder per side",
      (await remindersFor(E2, meetingId)) === 1 && (await remindersFor(M2, meetingId)) === 1);

    // 10. eligible again after another 2 days — and evaluated independently
    const eReminder = await prisma.notification.findFirst({
      where: { recipientId: E2, meetingId, type: "FEEDBACK_REMINDER" }, orderBy: { createdAt: "desc" },
    });
    await ageNotification(eReminder.id, 2 * DAY + 60000);
    await pm.materializeDueFeedbackRemindersForUser(E2);
    assert("mentee gets a 2nd reminder after 2 more days", (await remindersFor(E2, meetingId)) === 2);
    assert("mentor's reminder count unchanged (independent cadence)", (await remindersFor(M2, meetingId)) === 1);

    // hook: the reminder sweep also runs from the notification read model
    const mReminder = await prisma.notification.findFirst({
      where: { recipientId: M2, meetingId, type: "FEEDBACK_REMINDER" }, orderBy: { createdAt: "desc" },
    });
    await ageNotification(mReminder.id, 2 * DAY + 60000);
    await notif.unreadCountForUser(M2);
    assert("notificationService read model materializes M's next reminder", (await remindersFor(M2, meetingId)) === 2);

    // 11. submitting feedback stops future reminders + marks outstanding ones read
    await submitYes(meetingId, E2, { wantsAnotherMeeting: true });
    const eBefore = await remindersFor(E2, meetingId);
    // age all of E2's reminders far back so cadence alone would otherwise allow another
    await prisma.notification.updateMany({
      where: { recipientId: E2, meetingId, type: "FEEDBACK_REMINDER" },
      data: { createdAt: new Date(Date.now() - 10 * DAY) },
    });
    await pm.materializeDueFeedbackRemindersForUser(E2);
    assert("no new reminder for a participant who has submitted feedback",
      (await remindersFor(E2, meetingId)) === eBefore);
    assert("submit marked E's outstanding FEEDBACK_REMINDERs read",
      (await prisma.notification.count({
        where: { recipientId: E2, meetingId, type: "FEEDBACK_REMINDER", readAt: null },
      })) === 0);
  }

  console.log(`\n${"=".repeat(50)}\n  PASSED: ${passed}    FAILED: ${failed}\n${"=".repeat(50)}`);
}

main()
  .catch((e) => {
    console.error("\nSCRIPT ERROR:", e);
    failed++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
