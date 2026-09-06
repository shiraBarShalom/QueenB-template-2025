/* eslint-disable no-console */
// ============================================================================
// Manual verification for the Part 1 scheduling state machine.
// ============================================================================
// The project has no test runner, so this is a plain Node script. It:
//   1. creates isolated test data (emails prefixed "schedtest.")
//   2. drives services/schedulingService.js directly (no HTTP) through every
//      scenario listed in the Part 1 spec
//   3. asserts the resulting DB state
//   4. deletes its test data (FK-safe order), at start and end
//
// Run:  node scripts/verify-scheduling.js
// Exit: 0 = all passed, 1 = at least one failure.
// It only touches rows it created; existing data is left alone.
// ============================================================================

const prisma = require("../prismaClient");
const sched = require("../services/schedulingService");

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function bad(name, detail) {
  failed++;
  console.log(`  ✗ ${name}\n      ${detail}`);
}

function assert(name, cond, detail = "") {
  cond ? ok(name) : bad(name, detail || "assertion false");
}

// Assert that the call rejects (or throws synchronously) with `status`.
// Accepts a thunk `() => promise` OR a bare promise; a thunk also catches
// synchronous throws (e.g. slot-payload validation in proposeSlots).
async function expectStatus(name, fnOrPromise, status) {
  try {
    await (typeof fnOrPromise === "function" ? fnOrPromise() : fnOrPromise);
    bad(name, `expected ${status}, but the call resolved`);
  } catch (e) {
    if (e && e.status === status) ok(name);
    else bad(name, `expected status ${status}, got ${e && e.status} (${e && e.message})`);
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
    where: { email: { startsWith: "schedtest." } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;
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

  // FK-safe delete order (all relations are onDelete: RESTRICT).
  await prisma.meeting.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.offeredSlot.deleteMany({ where: { schedulingRoundId: { in: roundIds } } });
  await prisma.schedulingRound.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.mentoringRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.mentorProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  await cleanup();

  // --- fixtures -------------------------------------------------------------
  const mentorUser = await prisma.user.create({
    data: { email: "schedtest.mentor@verify.local", passwordHash: "x", fullName: "Test Mentor" },
  });
  const mentor2User = await prisma.user.create({
    data: { email: "schedtest.mentor2@verify.local", passwordHash: "x", fullName: "Other Mentor" },
  });
  const menteeUser = await prisma.user.create({
    data: { email: "schedtest.mentee@verify.local", passwordHash: "x", fullName: "Test Mentee" },
  });
  const mentee2User = await prisma.user.create({
    data: { email: "schedtest.mentee2@verify.local", passwordHash: "x", fullName: "Other Mentee" },
  });
  const mentorProfile = await prisma.mentorProfile.create({
    data: { userId: mentorUser.id, background: "bg", meetingCapacity: 10, meetingDurationMinutes: 30 },
  });
  const mentor2Profile = await prisma.mentorProfile.create({
    data: { userId: mentor2User.id, background: "bg", meetingCapacity: 10, meetingDurationMinutes: 30 },
  });

  const MENTOR = mentorUser.id;
  const MENTOR2 = mentor2User.id;
  const MENTEE = menteeUser.id;
  const MENTEE2 = mentee2User.id;

  const newRequest = () =>
    prisma.mentoringRequest.create({
      data: { menteeId: MENTEE, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" },
    });
  const statusOf = async (id) =>
    (await prisma.mentoringRequest.findUnique({ where: { id }, select: { status: true } })).status;
  const retryOf = async (id) =>
    (await prisma.mentoringRequest.findUnique({ where: { id }, select: { retryCount: true } })).retryCount;
  const meetingCount = (id) => prisma.meeting.count({ where: { requestId: id } });

  // === 1. Happy path: propose -> select ===================================
  console.log("\n[1] Happy path");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    assert("propose -> WAITING_FOR_MENTEE_SELECTION", (await statusOf(r.id)) === "WAITING_FOR_MENTEE_SELECTION");
    const round = await prisma.schedulingRound.findFirst({
      where: { requestId: r.id }, orderBy: { roundNumber: "desc" }, include: { offeredSlots: true },
    });
    assert("round 1 is INITIAL with 2 slots", round.roundNumber === 1 && round.type === "INITIAL" && round.offeredSlots.length === 2);
    await sched.selectSlot(r.id, MENTEE, round.offeredSlots[0].id);
    assert("select -> MATCHED", (await statusOf(r.id)) === "MATCHED");
    const meetings = await prisma.meeting.findMany({ where: { requestId: r.id } });
    assert("exactly one Meeting, one selected slot", meetings.length === 1 && meetings[0].selectedSlotId === round.offeredSlots[0].id && meetings[0].status === "SCHEDULED");
  }

  // === 2. Illegal transition from wrong status ============================
  console.log("\n[2] Wrong-status transitions");
  {
    const r = await newRequest(); // WAITING_FOR_MENTOR_SLOTS
    await expectStatus("select on WAITING_FOR_MENTOR_SLOTS -> 409", sched.selectSlot(r.id, MENTEE, 999999), 409);
    await expectStatus("cannot-attend on WAITING_FOR_MENTOR_SLOTS -> 409", sched.cannotAttend(r.id, MENTEE), 409);
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    await expectStatus("propose again on WAITING_FOR_MENTEE_SELECTION -> 409", sched.proposeSlots(r.id, MENTOR, futureSlots(2)), 409);
  }

  // === 3. Wrong mentor ===================================================
  console.log("\n[3] Wrong actor - mentor");
  {
    const r = await newRequest();
    await expectStatus("other mentor proposes -> 403", sched.proposeSlots(r.id, MENTOR2, futureSlots(2)), 403);
    await expectStatus("mentee proposes -> 403", sched.proposeSlots(r.id, MENTEE, futureSlots(2)), 403);
  }

  // === 4. Wrong mentee ==================================================
  console.log("\n[4] Wrong actor - mentee");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    const round = await prisma.schedulingRound.findFirst({ where: { requestId: r.id }, include: { offeredSlots: true } });
    await expectStatus("other mentee selects -> 403", sched.selectSlot(r.id, MENTEE2, round.offeredSlots[0].id), 403);
    await expectStatus("other mentee cannot-attend -> 403", sched.cannotAttend(r.id, MENTEE2), 403);
    await expectStatus("other mentee withdraws -> 403", sched.withdraw(r.id, MENTEE2), 403);
    await expectStatus("mentor selects (mentee action) -> 403", sched.selectSlot(r.id, MENTOR, round.offeredSlots[0].id), 403);
  }

  // === 5. Duplicate action ============================================
  console.log("\n[5] Duplicate action");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    await expectStatus("second propose -> 409", sched.proposeSlots(r.id, MENTOR, futureSlots(2)), 409);
    const round = await prisma.schedulingRound.findFirst({ where: { requestId: r.id }, include: { offeredSlots: true } });
    await sched.selectSlot(r.id, MENTEE, round.offeredSlots[0].id);
    await expectStatus("second select -> 409", sched.selectSlot(r.id, MENTEE, round.offeredSlots[1].id), 409);
    assert("still exactly one Meeting after 2nd select attempt", (await meetingCount(r.id)) === 1);
  }

  // === 6. CANNOT_ATTEND 0->1->2->CANCELLED ============================
  console.log("\n[6] Retry ladder");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    await sched.cannotAttend(r.id, MENTEE);
    assert("retry 0->1, back to WAITING_FOR_MENTOR_SLOTS", (await retryOf(r.id)) === 1 && (await statusOf(r.id)) === "WAITING_FOR_MENTOR_SLOTS");
    await sched.proposeSlots(r.id, MENTOR, futureSlots(3));
    await sched.cannotAttend(r.id, MENTEE);
    assert("retry 1->2", (await retryOf(r.id)) === 2 && (await statusOf(r.id)) === "WAITING_FOR_MENTOR_SLOTS");
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    await sched.cannotAttend(r.id, MENTEE);
    assert("retry 2 + CANNOT_ATTEND -> CANCELLED, retryCount stays 2", (await retryOf(r.id)) === 2 && (await statusOf(r.id)) === "CANCELLED");
  }

  // === 7. Old-round slot cannot be selected (also: rollback) ===========
  console.log("\n[7] Superseded-round slot");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2, Date.now() + 48 * HOUR));
    const round1 = await prisma.schedulingRound.findFirst({ where: { requestId: r.id }, orderBy: { roundNumber: "desc" }, include: { offeredSlots: true } });
    await sched.cannotAttend(r.id, MENTEE);
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2, Date.now() + 72 * HOUR));
    await expectStatus("select a round-1 slot after round 2 exists -> 409", sched.selectSlot(r.id, MENTEE, round1.offeredSlots[0].id), 409);
    assert("status unchanged after failed select (tx rollback)", (await statusOf(r.id)) === "WAITING_FOR_MENTEE_SELECTION");
    assert("no Meeting created after failed select (tx rollback)", (await meetingCount(r.id)) === 0);
  }

  // === 8. Slot from another request ==================================
  console.log("\n[8] Cross-request slot");
  {
    const r1 = await newRequest();
    const r2 = await newRequest();
    await sched.proposeSlots(r1.id, MENTOR, futureSlots(2));
    await sched.proposeSlots(r2.id, MENTOR, futureSlots(2));
    const r1round = await prisma.schedulingRound.findFirst({ where: { requestId: r1.id }, include: { offeredSlots: true } });
    await expectStatus("select r1's slot while acting on r2 -> 409", sched.selectSlot(r2.id, MENTEE, r1round.offeredSlots[0].id), 409);
    assert("r2 still WAITING_FOR_MENTEE_SELECTION", (await statusOf(r2.id)) === "WAITING_FOR_MENTEE_SELECTION");
  }

  // === 9. Terminal MATCHED ==========================================
  console.log("\n[9] MATCHED is terminal (except mentor CANCEL)");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    const round = await prisma.schedulingRound.findFirst({ where: { requestId: r.id }, include: { offeredSlots: true } });
    await sched.selectSlot(r.id, MENTEE, round.offeredSlots[0].id);
    await expectStatus("MATCHED + propose -> 409", sched.proposeSlots(r.id, MENTOR, futureSlots(2)), 409);
    await expectStatus("MATCHED + select -> 409", sched.selectSlot(r.id, MENTEE, round.offeredSlots[1].id), 409);
    await expectStatus("MATCHED + cannot-attend -> 409", sched.cannotAttend(r.id, MENTEE), 409);
    await expectStatus("MATCHED + withdraw -> 409", sched.withdraw(r.id, MENTEE), 409);
    // mentor CANCEL IS allowed from MATCHED:
    await sched.mentorCancel(r.id, MENTOR);
    assert("MATCHED + mentor CANCEL -> CANCELLED", (await statusOf(r.id)) === "CANCELLED");
    const m = await prisma.meeting.findFirst({ where: { requestId: r.id } });
    assert("Meeting.status -> CANCELLED in same transaction", m.status === "CANCELLED");
  }

  // === 10. Terminal CANCELLED / REJECTED ===========================
  console.log("\n[10] CANCELLED / REJECTED are fully terminal");
  {
    const rc = await newRequest();
    await sched.withdraw(rc.id, MENTEE);
    assert("withdraw -> CANCELLED", (await statusOf(rc.id)) === "CANCELLED");
    await expectStatus("CANCELLED + propose -> 409", sched.proposeSlots(rc.id, MENTOR, futureSlots(2)), 409);
    await expectStatus("CANCELLED + cannot-attend -> 409", sched.cannotAttend(rc.id, MENTEE), 409);
    await expectStatus("CANCELLED + mentor CANCEL -> 409", sched.mentorCancel(rc.id, MENTOR), 409);

    const rr = await newRequest();
    await sched.reject(rr.id, MENTOR);
    assert("reject -> REJECTED", (await statusOf(rr.id)) === "REJECTED");
    await expectStatus("REJECTED + propose -> 409", sched.proposeSlots(rr.id, MENTOR, futureSlots(2)), 409);
    await expectStatus("REJECTED + withdraw -> 409", sched.withdraw(rr.id, MENTEE), 409);
  }

  // === 11. Mentor CANCEL from PENDING_MENTEE ======================
  console.log("\n[11] Mentor CANCEL after proposing");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    await sched.mentorCancel(r.id, MENTOR);
    assert("PENDING_MENTEE + mentor CANCEL -> CANCELLED", (await statusOf(r.id)) === "CANCELLED");
    assert("no Meeting exists (never scheduled)", (await meetingCount(r.id)) === 0);
    await expectStatus("mentee cannot CANCEL (mentor action) -> 403",
      sched.mentorCancel((await newRequestProposed()).id, MENTEE), 403);
  }
  async function newRequestProposed() {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    return r;
  }

  // === 12. Slot-count rule (exactly 2-3) =========================
  console.log("\n[12] Proposal must contain 2-3 slots");
  {
    const r = await newRequest();
    await expectStatus("propose 1 slot -> 400", () => sched.proposeSlots(r.id, MENTOR, futureSlots(1)), 400);
    await expectStatus("propose 4 slots -> 400", () => sched.proposeSlots(r.id, MENTOR, futureSlots(4)), 400);
    assert("request untouched after bad-count proposals", (await statusOf(r.id)) === "WAITING_FOR_MENTOR_SLOTS");
    assert("no round created after bad-count proposals", (await prisma.schedulingRound.count({ where: { requestId: r.id } })) === 0);
  }

  // === 13. Past-dated slot cannot be selected ===================
  console.log("\n[13] Stale slot");
  {
    const r = await newRequest();
    // propose valid future slots, then move DB time forward by making a slot 'past'
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2, Date.now() + 2000));
    const round = await prisma.schedulingRound.findFirst({ where: { requestId: r.id }, include: { offeredSlots: true } });
    await new Promise((res) => setTimeout(res, 2500)); // let the first slot's startTime pass
    await expectStatus("select a now-past slot -> 409", sched.selectSlot(r.id, MENTEE, round.offeredSlots[0].id), 409);
    assert("status unchanged after past-slot select (rollback)", (await statusOf(r.id)) === "WAITING_FOR_MENTEE_SELECTION");
  }

  // === 14. Nonexistent request / bad ids ======================
  console.log("\n[14] Not found / invalid id");
  {
    await expectStatus("action on missing request -> 404", sched.proposeSlots(2147483000, MENTOR, futureSlots(2)), 404);
    await expectStatus("non-numeric requestId -> 400", sched.withdraw("abc", MENTEE), 400);
  }

  // === 15. Concurrency: SELECT_SLOT vs CANNOT_ATTEND =============
  console.log("\n[15] Concurrent SELECT_SLOT vs CANNOT_ATTEND");
  {
    const r = await newRequest();
    await sched.proposeSlots(r.id, MENTOR, futureSlots(2));
    const round = await prisma.schedulingRound.findFirst({ where: { requestId: r.id }, include: { offeredSlots: true } });
    const results = await Promise.allSettled([
      sched.selectSlot(r.id, MENTEE, round.offeredSlots[0].id),
      sched.cannotAttend(r.id, MENTEE),
    ]);
    const fulfilled = results.filter((x) => x.status === "fulfilled").length;
    const rejected = results.filter((x) => x.status === "rejected");
    assert("exactly one of the two succeeded", fulfilled === 1 && rejected.length === 1);
    assert("the loser failed with 409", rejected[0].reason && rejected[0].reason.status === 409);
    const st = await statusOf(r.id);
    const rc = await retryOf(r.id);
    const mc = await meetingCount(r.id);
    assert(
      "final state is internally consistent (MATCHED+1 meeting+rc0  XOR  WAITING_FOR_MENTOR_SLOTS+0 meeting+rc1)",
      (st === "MATCHED" && mc === 1 && rc === 0) ||
        (st === "WAITING_FOR_MENTOR_SLOTS" && mc === 0 && rc === 1),
      `got status=${st} retryCount=${rc} meetings=${mc}`
    );
  }

  // === 16. Concurrency: PROPOSE_SLOTS vs WITHDRAW ===============
  console.log("\n[16] Concurrent PROPOSE_SLOTS vs WITHDRAW");
  {
    const r = await newRequest();
    const results = await Promise.allSettled([
      sched.proposeSlots(r.id, MENTOR, futureSlots(2)),
      sched.withdraw(r.id, MENTEE),
    ]);
    const fulfilled = results.filter((x) => x.status === "fulfilled").length;
    assert("exactly one of the two succeeded", fulfilled === 1);
    const st = await statusOf(r.id);
    const roundCount = await prisma.schedulingRound.count({ where: { requestId: r.id } });
    assert(
      "never CANCELLED with an active round (propose wins => PENDING_MENTEE+1 round; withdraw wins => CANCELLED+0 rounds)",
      (st === "WAITING_FOR_MENTEE_SELECTION" && roundCount === 1) ||
        (st === "CANCELLED" && roundCount === 0),
      `got status=${st} rounds=${roundCount}`
    );
  }

  // === 17. Self-request guard ================================
  console.log("\n[17] Self-request (mentor == mentee)");
  {
    const selfReq = await prisma.mentoringRequest.create({
      data: { menteeId: MENTOR, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" },
    });
    await expectStatus("any action on a self-request -> 409", sched.proposeSlots(selfReq.id, MENTOR, futureSlots(2)), 409);
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
