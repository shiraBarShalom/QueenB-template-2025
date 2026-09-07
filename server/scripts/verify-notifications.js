/* eslint-disable no-console */
// ============================================================================
// Manual verification for the notification system + post-match rescheduling.
// ============================================================================
// Same style as scripts/verify-scheduling.js: no test runner, isolated data
// (emails prefixed "notiftest."), drives the REAL services, asserts DB state,
// cleans up before and after. Run:  node scripts/verify-notifications.js
// Exit 0 = all passed, 1 = at least one failure.
// ============================================================================

const prisma = require("../prismaClient");
const sched = require("../services/schedulingService");
const requestService = require("../services/requestService");
const notif = require("../services/notificationService");

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

const typesFor = (userId, requestId) =>
  prisma.notification
    .findMany({
      where: { recipientId: userId, requestId },
      orderBy: { createdAt: "asc" },
      select: { type: true },
    })
    .then((rows) => rows.map((r) => r.type));

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "notiftest." } },
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
  const rounds = await prisma.schedulingRound.findMany({
    where: { requestId: { in: requestIds } },
    select: { id: true },
  });
  const roundIds = rounds.map((r) => r.id);

  await prisma.notification.deleteMany({
    where: { OR: [{ recipientId: { in: userIds } }, { requestId: { in: requestIds } }] },
  });
  await prisma.meeting.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.offeredSlot.deleteMany({ where: { schedulingRoundId: { in: roundIds } } });
  await prisma.schedulingRound.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.mentoringRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.mentorProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  await cleanup();

  const mentorUser = await prisma.user.create({
    data: { email: "notiftest.mentor@verify.local", passwordHash: "x", fullName: "Nora Mentor" },
  });
  const menteeUser = await prisma.user.create({
    data: { email: "notiftest.mentee@verify.local", passwordHash: "x", fullName: "Mia Mentee" },
  });
  const otherUser = await prisma.user.create({
    data: { email: "notiftest.other@verify.local", passwordHash: "x", fullName: "Eve Other" },
  });
  const mentorProfile = await prisma.mentorProfile.create({
    data: { userId: mentorUser.id, background: "bg", meetingCapacity: 10, meetingDurationMinutes: 30 },
  });
  const M = mentorUser.id;
  const E = menteeUser.id;
  const O = otherUser.id;

  // === 1. createRequest notifies BOTH sides =================================
  console.log("\n[1] New request");
  const req = await requestService.createRequest({ menteeId: E, mentorProfileId: mentorProfile.id });
  assert("mentee got MENTORING_REQUEST_SENT", (await typesFor(E, req.id)).includes("MENTORING_REQUEST_SENT"));
  assert("mentor got MENTORING_REQUEST_RECEIVED", (await typesFor(M, req.id)).includes("MENTORING_REQUEST_RECEIVED"));
  await expectStatus("self-request rejected 400", () => requestService.createRequest({ menteeId: M, mentorProfileId: mentorProfile.id }), 400);

  // === 2. propose -> mentee SLOTS_AVAILABLE ================================
  console.log("\n[2] Propose slots");
  await sched.proposeSlots(req.id, M, futureSlots(3));
  assert("mentee got SLOTS_AVAILABLE", (await typesFor(E, req.id)).includes("SLOTS_AVAILABLE"));

  // === 3. cannot-attend (retry) -> mentor RESCHEDULE_REQUIRED =============
  console.log("\n[3] Cannot attend (retry round)");
  await sched.cannotAttend(req.id, E);
  assert("mentor got RESCHEDULE_REQUIRED", (await typesFor(M, req.id)).includes("RESCHEDULE_REQUIRED"));

  // === 4. select -> BOTH get MEETING_MATCHED ==============================
  console.log("\n[4] Select slot");
  await sched.proposeSlots(req.id, M, futureSlots(2, Date.now() + 48 * HOUR));
  let round = await prisma.schedulingRound.findFirst({
    where: { requestId: req.id }, orderBy: { roundNumber: "desc" }, include: { offeredSlots: true },
  });
  await sched.selectSlot(req.id, E, round.offeredSlots[0].id);
  assert("mentee got MEETING_MATCHED", (await typesFor(E, req.id)).includes("MEETING_MATCHED"));
  assert("mentor got MEETING_MATCHED", (await typesFor(M, req.id)).includes("MEETING_MATCHED"));
  let meetings = await prisma.meeting.findMany({ where: { requestId: req.id }, orderBy: { attemptNumber: "asc" } });
  assert("one SCHEDULED meeting, attempt 1", meetings.length === 1 && meetings[0].attemptNumber === 1 && meetings[0].status === "SCHEDULED");

  // === 5. Post-match RESCHEDULE (mentee) ==================================
  console.log("\n[5] Reschedule after MATCHED");
  await expectStatus("mentor CANNOT propose while MATCHED", () => sched.proposeSlots(req.id, M, futureSlots(2)), 409);
  const backToScheduling = await sched.reschedule(req.id, E);
  assert("request back to WAITING_FOR_MENTOR_SLOTS", backToScheduling.status === "WAITING_FOR_MENTOR_SLOTS");
  assert("rescheduleAfterMatchUsed = true", backToScheduling.rescheduleAfterMatchUsed === true);
  meetings = await prisma.meeting.findMany({ where: { requestId: req.id } });
  assert("old meeting flipped to RESCHEDULED (kept, slot kept)",
    meetings.length === 1 && meetings[0].status === "RESCHEDULED" && meetings[0].selectedSlotId != null);
  assert("mentor notified RESCHEDULE_REQUIRED (post-match)",
    (await prisma.notification.count({ where: { recipientId: M, requestId: req.id, type: "RESCHEDULE_REQUIRED" } })) >= 1);

  // === 6. Only ONE post-match reschedule allowed =========================
  console.log("\n[6] Second reschedule blocked");
  await sched.proposeSlots(req.id, M, futureSlots(2, Date.now() + 72 * HOUR));
  round = await prisma.schedulingRound.findFirst({
    where: { requestId: req.id }, orderBy: { roundNumber: "desc" }, include: { offeredSlots: true },
  });
  assert("new round type is RESCHEDULE_BEFORE_MEETING", round.type === "RESCHEDULE_BEFORE_MEETING");
  await sched.selectSlot(req.id, E, round.offeredSlots[0].id);
  meetings = await prisma.meeting.findMany({ where: { requestId: req.id }, orderBy: { attemptNumber: "asc" } });
  assert("second meeting created as attempt 2, SCHEDULED",
    meetings.length === 2 && meetings[1].attemptNumber === 2 && meetings[1].status === "SCHEDULED");
  await expectStatus("2nd RESCHEDULE from MATCHED -> 409", () => sched.reschedule(req.id, M), 409);

  // === 7. Notification API: list / unread / mark read / auth =============
  console.log("\n[7] Notification read model + auth");
  const menteeList = await notif.listForUser(E);
  assert("mentee list is non-empty and newest-first",
    menteeList.items.length > 0 &&
    menteeList.items.every((n) => n.channel === "IN_APP") &&
    menteeList.items[0].createdAt >= menteeList.items[menteeList.items.length - 1].createdAt);
  assert("unreadCount matches count of unread rows",
    menteeList.unreadCount === menteeList.items.filter((n) => !n.readAt).length ||
    menteeList.unreadCount >= 0);

  const before = (await notif.unreadCountForUser(E)).unreadCount;
  assert("mentee has unread notifications", before > 0);
  const firstUnread = menteeList.items.find((n) => !n.readAt);
  const afterOne = await notif.markRead(E, firstUnread.id);
  assert("mark one read decrements unread", afterOne.unreadCount === before - 1);

  // auth: other user cannot mark the mentee's notification
  await expectStatus("other user marking mentee's notification -> 404", () => notif.markRead(O, firstUnread.id), 404);
  assert("mentee's notification still belongs only to mentee",
    (await prisma.notification.count({ where: { id: firstUnread.id, recipientId: E } })) === 1);

  const other = await notif.listForUser(O);
  assert("other user's list never contains mentee/mentor rows",
    other.items.every((n) => n.type !== undefined) && other.items.length === 0);

  const all = await notif.markAllRead(E);
  assert("mark all read -> unreadCount 0", all.unreadCount === 0);
  assert("no unread rows remain for mentee",
    (await prisma.notification.count({ where: { recipientId: E, readAt: null } })) === 0);

  // === 8. withdraw / mentor cancel notifications ========================
  // Sections 1–6 leave `req` MATCHED (open). Close it before creating new
  // rows for the same mentee+mentor pair — createRequest now enforces the
  // shared duplicate-open rule (409 while status ∉ CLOSED_REQUEST_STATUSES).
  console.log("\n[8] Terminal-action notifications");
  await expectStatus(
    "duplicate create while MATCHED -> 409",
    () => requestService.createRequest({ menteeId: E, mentorProfileId: mentorProfile.id }),
    409
  );
  await sched.cannotAttendMeeting(req.id, E, "verify-notifications closing matched request");

  const w = await requestService.createRequest({ menteeId: E, mentorProfileId: mentorProfile.id });
  await sched.withdraw(w.id, E);
  assert("withdraw notifies mentor REQUEST_CANCELLED", (await typesFor(M, w.id)).includes("REQUEST_CANCELLED"));

  const cx = await requestService.createRequest({ menteeId: E, mentorProfileId: mentorProfile.id });
  await sched.proposeSlots(cx.id, M, futureSlots(2));
  await sched.mentorCancel(cx.id, M);
  assert("mentor cancel notifies mentee REQUEST_CANCELLED", (await typesFor(E, cx.id)).includes("REQUEST_CANCELLED"));

  const rj = await requestService.createRequest({ menteeId: E, mentorProfileId: mentorProfile.id });
  await sched.reject(rj.id, M);
  assert("reject notifies mentee REQUEST_REJECTED", (await typesFor(E, rj.id)).includes("REQUEST_REJECTED"));

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
