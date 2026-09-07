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
      comment: "Really useful session.",
    });
    assert("after mentee-only submit: meeting still SCHEDULED", (await meetingStatus(meetingId)) === "SCHEDULED");
    assert("after mentee-only submit: request still MATCHED (not marked done on one voice)",
      (await requestStatus(requestId)) === "MATCHED");

    const midCtx = await pm.getFeedbackContext(meetingId, E);
    assert("mentee ctx now alreadySubmitted && !canSubmit", midCtx.alreadySubmitted && !midCtx.canSubmit);
    const mentorMid = await pm.getFeedbackContext(meetingId, M);
    assert("mentor ctx still canSubmit (independent)", mentorMid.canSubmit && !mentorMid.alreadySubmitted);

    await pm.submitFeedback(meetingId, M, {
      actingUserId: M,
      occurred: true,
      rating: 4,
      wasHelpful: "SOMEWHAT",
      // mentor sends wouldContinueMentoring -> must be ignored, never stored
      wouldContinueMentoring: "YES",
      comment: "Good chat.",
    });

    const rows = await prisma.feedback.findMany({
      where: { meetingId }, orderBy: { authorRole: "asc" },
    });
    assert("two Feedback rows — one per participant", rows.length === 2);
    const menteeRow = rows.find((r) => r.authorId === E);
    const mentorRow = rows.find((r) => r.authorId === M);
    assert("mentee row: role MENTEE, rating 5, wasHelpful YES, continue YES",
      menteeRow.authorRole === "MENTEE" && menteeRow.rating === 5 &&
      menteeRow.wasHelpful === "YES" && menteeRow.wouldContinueMentoring === "YES");
    assert("mentor row: role MENTOR, rating 4, wasHelpful SOMEWHAT, continue NULL (mentee-only)",
      mentorRow.authorRole === "MENTOR" && mentorRow.rating === 4 &&
      mentorRow.wasHelpful === "SOMEWHAT" && mentorRow.wouldContinueMentoring === null);
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
    await pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 3, wasHelpful: "NO" });
    await expectStatus("second submit by the same participant -> 409",
      () => pm.submitFeedback(meetingId, E, { actingUserId: E, occurred: true, rating: 4, wasHelpful: "YES" }), 409);
    const rows = await prisma.feedback.count({ where: { meetingId, authorId: E } });
    assert("still exactly one Feedback row for that participant", rows === 1);

    // concurrent double submit: exactly one wins
    const c = await matchedPastMeeting(E, M, mentorProfile.id);
    const results = await Promise.allSettled([
      pm.submitFeedback(c.meetingId, E, { actingUserId: E, occurred: true, rating: 5, wasHelpful: "YES" }),
      pm.submitFeedback(c.meetingId, E, { actingUserId: E, occurred: true, rating: 1, wasHelpful: "NO" }),
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
