/* eslint-disable no-console */
// ============================================================================
// Development / demo dataset for the Mentor Area + scheduling flow.
// ============================================================================
// NOT a migration and NOT production data. It creates a recognizable set of
// users / mentors / mentoring requests so the Mentor Area dashboard, request
// cards and the propose-slots flow are visibly populated.
//
//   node scripts/seed-scheduling-demo.js          seed (idempotent)
//   node scripts/seed-scheduling-demo.js --reset   remove ALL demo data, then stop
//
// Safety / repeatability:
//   * every demo row is tagged: user emails start with "demo.sched." and demo
//     ids live in a fixed high range (users 9001+, profiles 9101+, requests
//     9201+) so useCurrentUser can point at the demo mentor permanently.
//   * each run first deletes ONLY the previous demo rows (scoped to that email
//     prefix + its owned profiles/requests/rounds/slots/meetings), then rebuilds
//     — so running it twice does not pile up duplicates and never touches
//     unrelated users or requests.
//
// State-machine consistency:
//   Every non-trivial status is produced by driving the request through the
//   REAL Part 1 services (schedulingService.proposeSlots / selectSlot / reject /
//   withdraw). Nothing writes a "MATCHED" row by hand — so a MATCHED demo
//   request always has a SchedulingRound + a selected OfferedSlot + a Meeting
//   (status SCHEDULED), exactly like the running application would create.
// ============================================================================

const prisma = require("../prismaClient");
const sched = require("../services/schedulingService");
const requestService = require("../services/requestService");
const notif = require("../services/notificationService");
const { hashPassword } = require("../services/userService");

const EMAIL_PREFIX = "demo.sched.";
const DEMO_PASSWORD = "demo1234";
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// Fixed id bases — keep the demo mentor's ids stable across reset/reseed so the
// placeholder auth (client/src/auth/useCurrentUser.js) can hardcode them.
const U = (n) => 9000 + n; // users   9001..9015
const P = (n) => 9100 + n; // profiles 9101..9105
const R = (n) => 9200 + n; // requests 9201..

// Build n future { startTime, endTime } pairs, `startInDays` out, spaced 2h.
function futureSlots(n, startInDays, durationMin) {
  const base = Date.now() + startInDays * DAY + HOUR; // +1h so it's never "now"
  return Array.from({ length: n }, (_, i) => ({
    startTime: new Date(base + i * 2 * HOUR).toISOString(),
    endTime: new Date(base + i * 2 * HOUR + durationMin * 60 * 1000).toISOString(),
  }));
}

// ----------------------------------------------------------------------------
// Roster
// ----------------------------------------------------------------------------
const MENTORS = [
  {
    uid: U(1), pid: P(1), key: "maya",
    fullName: "Maya Ben-David", jobTitle: "Senior Frontend Engineer", workplace: "Wix",
    yearsOfExperience: 9, durationMin: 30, capacity: 20,
    background: "Frontend architecture, design systems and growing into senior roles.",
    topics: ["Frontend architecture", "Career growth"],
    technologies: ["React", "TypeScript", "CSS"],
    spokenLanguages: ["Hebrew", "English"],
  },
  {
    uid: U(2), pid: P(2), key: "noa",
    fullName: "Noa Levi", jobTitle: "Backend Team Lead", workplace: "Monday.com",
    yearsOfExperience: 11, durationMin: 45, capacity: 12,
    background: "Backend systems, API design and first-time team leadership.",
    topics: ["System design", "Leadership"],
    technologies: ["Node.js", "PostgreSQL", "AWS"],
    spokenLanguages: ["Hebrew", "English"],
  },
  {
    uid: U(3), pid: P(3), key: "tamar",
    fullName: "Tamar Cohen", jobTitle: "Data Scientist", workplace: "Meta",
    yearsOfExperience: 7, durationMin: 30, capacity: 10,
    background: "Applied ML and technical interview preparation.",
    topics: ["Machine learning", "Interview prep"],
    technologies: ["Python", "SQL", "PyTorch"],
    spokenLanguages: ["Hebrew", "Arabic", "English"],
  },
  {
    uid: U(4), pid: P(4), key: "rivka",
    fullName: "Rivka Katz", jobTitle: "Staff Engineer", workplace: "Google",
    yearsOfExperience: 14, durationMin: 60, capacity: 8,
    background: "Distributed systems and long-term technical career planning.",
    topics: ["Distributed systems"],
    technologies: ["Go", "Kubernetes"],
    spokenLanguages: ["English"],
  },
  {
    uid: U(5), pid: P(5), key: "dana",
    fullName: "Dana Shapiro", jobTitle: "Product Engineer", workplace: "Riskified",
    yearsOfExperience: 6, durationMin: 30, capacity: 15,
    background: "Fullstack product work and going freelance.",
    topics: ["Fullstack", "Freelancing"],
    technologies: ["React", "Node.js"],
    spokenLanguages: ["Hebrew", "Arabic"],
  },
];

const MENTEES = [
  { uid: U(6), key: "shira", fullName: "Shira Mizrahi", jobTitle: "CS Student", workplace: "Tel Aviv University", yearsOfExperience: 0, technologies: ["Java", "Python"], img: "https://i.pravatar.cc/150?img=45" },
  { uid: U(7), key: "yael", fullName: "Yael Azoulay", jobTitle: "Junior Developer", workplace: "Fiverr", yearsOfExperience: 1, technologies: ["React", "JavaScript"], img: "https://i.pravatar.cc/150?img=32" },
  { uid: U(8), key: "avigail", fullName: "Avigail Peretz", jobTitle: "QA Engineer", workplace: "Payoneer", yearsOfExperience: 2, technologies: ["Python"], img: null },
  { uid: U(9), key: "hodaya", fullName: "Hodaya Friedman", jobTitle: "Bootcamp Graduate", workplace: "Job seeking", yearsOfExperience: 0, technologies: ["React", "Node.js"], img: "https://i.pravatar.cc/150?img=47" },
  { uid: U(10), key: "lior", fullName: "Lior Ben-Ami", jobTitle: "Junior Backend Developer", workplace: "Lemonade", yearsOfExperience: 1, technologies: ["Node.js", "MongoDB"], img: null },
  { uid: U(11), key: "michal", fullName: "Michal Sror", jobTitle: "Career Switcher (ex-QA)", workplace: "Studying", yearsOfExperience: 1, technologies: ["JavaScript", "CSS"], img: null },
  { uid: U(12), key: "efrat", fullName: "Efrat Dahan", jobTitle: "Data Analyst", workplace: "eToro", yearsOfExperience: 3, technologies: ["SQL", "Python"], img: "https://i.pravatar.cc/150?img=20" },
  { uid: U(14), key: "gefen", fullName: "Gefen Halevi", jobTitle: "Mobile Developer", workplace: "Wix", yearsOfExperience: 2, technologies: ["React Native", "TypeScript"], img: null },
  { uid: U(15), key: "tair", fullName: "Tair Cohen", jobTitle: "Fullstack Student", workplace: "John Bryce", yearsOfExperience: 0, technologies: ["HTML", "CSS", "JavaScript"], img: null },
];

// menteeKey OR mentorKey (mentor acting as a mentee) -> request target status.
// `propose` = how many slots the mentor offers for states that need a round.
const REQUESTS = [
  // ---- Maya: the rich dashboard --------------------------------------------
  { n: 1, mentor: "maya", mentee: "shira", target: "WAITING_FOR_MENTOR_SLOTS" },
  { n: 2, mentor: "maya", mentee: "yael", target: "WAITING_FOR_MENTOR_SLOTS" },
  { n: 3, mentor: "maya", mentee: "avigail", target: "WAITING_FOR_MENTOR_SLOTS" },
  { n: 4, mentor: "maya", mentee: "hodaya", target: "WAITING_FOR_MENTEE_SELECTION", propose: 3 },
  { n: 5, mentor: "maya", mentee: "lior", target: "WAITING_FOR_MENTEE_SELECTION", propose: 2 },
  { n: 6, mentor: "maya", mentee: "michal", target: "MATCHED", propose: 2 },
  { n: 7, mentor: "maya", mentee: "efrat", target: "MATCHED", propose: 3 },
  { n: 8, mentor: "maya", mentee: "gefen", target: "CANCELLED" },
  { n: 9, mentor: "maya", mentee: "tair", target: "REJECTED" },
  // ---- other mentors: lighter, plus an empty one --------------------------
  { n: 10, mentor: "noa", mentee: "shira", target: "WAITING_FOR_MENTOR_SLOTS" },
  { n: 11, mentor: "noa", mentee: "michal", target: "MATCHED", propose: 2 },
  { n: 12, mentor: "tamar", mentee: "yael", target: "WAITING_FOR_MENTOR_SLOTS" },
  { n: 13, mentor: "tamar", mentee: "noa", target: "WAITING_FOR_MENTOR_SLOTS" }, // Noa is a mentee here
  { n: 14, mentor: "dana", mentee: "efrat", target: "WAITING_FOR_MENTEE_SELECTION", propose: 2 },
  // rivka: intentionally none -> empty-dashboard test
];

// ----------------------------------------------------------------------------
// Cleanup — scoped strictly to demo rows
// ----------------------------------------------------------------------------
async function cleanupDemo() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return 0;

  const profiles = await prisma.mentorProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);

  const reqs = await prisma.mentoringRequest.findMany({
    where: {
      OR: [{ menteeId: { in: userIds } }, { mentorProfileId: { in: profileIds } }],
    },
    select: { id: true },
  });
  const reqIds = reqs.map((r) => r.id);

  const rounds = await prisma.schedulingRound.findMany({
    where: { requestId: { in: reqIds } },
    select: { id: true },
  });
  const roundIds = rounds.map((r) => r.id);

  // FK-safe order (relations are onDelete: RESTRICT).
  await prisma.notification.deleteMany({
    where: {
      OR: [{ recipientId: { in: userIds } }, { requestId: { in: reqIds } }],
    },
  });
  await prisma.meeting.deleteMany({ where: { requestId: { in: reqIds } } });
  await prisma.offeredSlot.deleteMany({ where: { schedulingRoundId: { in: roundIds } } });
  await prisma.schedulingRound.deleteMany({ where: { requestId: { in: reqIds } } });
  await prisma.mentoringRequest.deleteMany({ where: { id: { in: reqIds } } });
  await prisma.mentorProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  return userIds.length;
}

// ----------------------------------------------------------------------------
// Seed
// ----------------------------------------------------------------------------
function techConnect(names) {
  return {
    connectOrCreate: names.map((name) => ({ where: { name }, create: { name } })),
  };
}

function spokenLanguagesConnect(names) {
  return {
    connectOrCreate: names.map((name) => ({ where: { name }, create: { name } })),
  };
}

async function seed() {
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const byKey = {}; // key -> { uid, pid? }

  // Users: mentors first, then mentees.
  for (const m of MENTORS) {
    await prisma.user.create({
      data: {
        id: m.uid,
        email: `${EMAIL_PREFIX}${m.key}@matchqueens.local`,
        passwordHash,
        fullName: m.fullName,
        jobTitle: m.jobTitle,
        workplace: m.workplace,
        yearsOfExperience: m.yearsOfExperience,
        technologies: techConnect(m.technologies),
        spokenLanguages: spokenLanguagesConnect(m.spokenLanguages || []),
      },
    });
    byKey[m.key] = { uid: m.uid, pid: m.pid, fullName: m.fullName };
  }
  for (const mt of MENTEES) {
    await prisma.user.create({
      data: {
        id: mt.uid,
        email: `${EMAIL_PREFIX}${mt.key}@matchqueens.local`,
        passwordHash,
        fullName: mt.fullName,
        jobTitle: mt.jobTitle,
        workplace: mt.workplace,
        yearsOfExperience: mt.yearsOfExperience,
        profileImageUrl: mt.img,
        technologies: techConnect(mt.technologies),
        ...(mt.spokenLanguages?.length
          ? { spokenLanguages: spokenLanguagesConnect(mt.spokenLanguages) }
          : {}),
      },
    });
    byKey[mt.key] = { uid: mt.uid, fullName: mt.fullName };
  }

  // Mentor profiles.
  for (const m of MENTORS) {
    await prisma.mentorProfile.create({
      data: {
        id: m.pid,
        userId: m.uid,
        background: m.background,
        meetingCapacity: m.capacity,
        meetingDurationMinutes: m.durationMin,
        mentoringTopics: {
          connectOrCreate: m.topics.map((name) => ({ where: { name }, create: { name } })),
        },
      },
    });
  }

  // Requests — each starts as WAITING_FOR_MENTOR_SLOTS, then the real services
  // drive it to its target state.
  const results = [];
  for (const spec of REQUESTS) {
    const mentor = MENTORS.find((m) => m.key === spec.mentor);
    const menteeUid = byKey[spec.mentee].uid;
    if (menteeUid === mentor.uid) {
      throw new Error(`req #${spec.n}: self-request (mentee === mentor user ${menteeUid})`);
    }

    const req = await prisma.mentoringRequest.create({
      data: {
        id: R(spec.n),
        menteeId: menteeUid,
        mentorProfileId: mentor.pid,
        status: "WAITING_FOR_MENTOR_SLOTS",
      },
    });

    // The opening pair of notifications createRequest() would have written (the
    // seed inserts the row directly to keep fixed ids, so add them by hand).
    await notif.createNotifications(prisma, [
      {
        recipientId: menteeUid,
        type: "MENTORING_REQUEST_SENT",
        requestId: req.id,
        payload: { mentorName: mentor.fullName },
      },
      {
        recipientId: mentor.uid,
        type: "MENTORING_REQUEST_RECEIVED",
        requestId: req.id,
        payload: { menteeName: byKey[spec.mentee].fullName || spec.mentee },
      },
    ]);

    if (spec.target === "WAITING_FOR_MENTOR_SLOTS") {
      // nothing more
    } else if (spec.target === "REJECTED") {
      await sched.reject(req.id, mentor.uid);
    } else if (spec.target === "CANCELLED") {
      await sched.withdraw(req.id, menteeUid);
    } else {
      // needs a proposal round
      await sched.proposeSlots(
        req.id,
        mentor.uid,
        futureSlots(spec.propose, 3 + (spec.n % 5), mentor.durationMin)
      );
      if (spec.target === "MATCHED") {
        const round = await prisma.schedulingRound.findFirst({
          where: { requestId: req.id },
          orderBy: { roundNumber: "desc" },
          include: { offeredSlots: true },
        });
        await sched.selectSlot(req.id, menteeUid, round.offeredSlots[0].id);
      } else if (spec.target !== "WAITING_FOR_MENTEE_SELECTION") {
        throw new Error(`req #${spec.n}: unknown target ${spec.target}`);
      }
    }

    results.push({ n: spec.n, id: req.id, mentor: spec.mentor, mentee: spec.mentee, target: spec.target });
  }

  return { byKey, results };
}

// ----------------------------------------------------------------------------
// Verify + report
// ----------------------------------------------------------------------------
async function verify() {
  const maya = MENTORS[0];
  const dash = await requestService.getMentorDashboard(maya.pid);

  const dbCounts = await prisma.mentoringRequest.groupBy({
    by: ["status"],
    where: { mentorProfileId: maya.pid },
    _count: { _all: true },
  });
  const raw = Object.fromEntries(dbCounts.map((g) => [g.status, g._count._all]));

  // Every MATCHED demo request must really have a SCHEDULED Meeting + selected slot.
  const matched = await prisma.mentoringRequest.findMany({
    where: { mentorProfileId: maya.pid, status: "MATCHED" },
    include: { meetings: { include: { selectedSlot: true } } },
  });
  const matchedOk = matched.every(
    (r) =>
      r.meetings.length === 1 &&
      r.meetings[0].status === "SCHEDULED" &&
      r.meetings[0].selectedSlotId != null &&
      r.meetings[0].selectedSlot != null
  );

  // Every WAITING_FOR_MENTEE_SELECTION demo request must have a round with 2–3 future slots.
  const pendingMentee = await prisma.mentoringRequest.findMany({
    where: { mentorProfileId: maya.pid, status: "WAITING_FOR_MENTEE_SELECTION" },
    include: { schedulingRounds: { include: { offeredSlots: true }, orderBy: { roundNumber: "desc" } } },
  });
  const now = Date.now();
  const pendingOk = pendingMentee.every((r) => {
    const round = r.schedulingRounds[0];
    return (
      round &&
      round.offeredSlots.length >= 2 &&
      round.offeredSlots.length <= 3 &&
      round.offeredSlots.every((s) => s.startTime.getTime() > now)
    );
  });

  const checks = [
    ["dashboard.waitingForResponse === DB WAITING_FOR_MENTOR_SLOTS",
      dash.counts.waitingForResponse === (raw.WAITING_FOR_MENTOR_SLOTS || 0)],
    ["dashboard.awaitingMenteeSelection === DB WAITING_FOR_MENTEE_SELECTION",
      dash.counts.awaitingMenteeSelection === (raw.WAITING_FOR_MENTEE_SELECTION || 0)],
    ["dashboard.scheduledMeetings === DB MATCHED",
      dash.counts.scheduledMeetings === (raw.MATCHED || 0)],
    ["dashboard.incomingRequests length === waitingForResponse",
      dash.incomingRequests.length === dash.counts.waitingForResponse],
    ["incoming cards carry mentee name + no email leak",
      dash.incomingRequests.every((r) => r.mentee.fullName && !("email" in r.mentee))],
    ["every MATCHED has 1 SCHEDULED meeting + selected slot", matchedOk],
    ["every WAITING_FOR_MENTEE_SELECTION has a round with 2–3 future slots", pendingOk],
  ];

  return { dash, raw, checks };
}

async function main() {
  const reset = process.argv.includes("--reset");

  const removed = await cleanupDemo();
  console.log(`cleanup: removed ${removed} previous demo user(s) and their scheduling rows`);

  if (reset) {
    console.log("\n--reset: demo data cleared. Nothing seeded.");
    return;
  }

  const { results } = await seed();
  console.log(`seeded: ${MENTORS.length} mentors, ${MENTEES.length} mentees, ${results.length} requests`);

  const { dash, raw, checks } = await verify();

  console.log("\n--- Maya dashboard (GET /api/mentors/9101/dashboard) ---");
  console.log("counts:", dash.counts);
  console.log("DB statuses:", raw);
  console.log("incoming request cards:", dash.incomingRequests.map((r) => r.mentee.fullName));

  let failed = 0;
  console.log("\n--- consistency checks ---");
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) failed += 1;
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log("  DEMO MENTOR (already wired into client/src/auth/useCurrentUser.js)");
  console.log(`${"=".repeat(64)}`);
  console.log("  Demo mentor user id: 9001");
  console.log("  MentorProfile id:    9101");
  console.log("  Name:                Maya Ben-David  (demo.sched.maya@matchqueens.local / demo1234)");
  console.log("  Requests for Maya:");
  console.log("    WAITING_FOR_MENTOR_SLOTS   x3  (Shira Mizrahi, Yael Azoulay, Avigail Peretz)  <- incoming cards");
  console.log("    WAITING_FOR_MENTEE_SELECTION x2 (Hodaya Friedman [3 slots], Lior Ben-Ami [2 slots])");
  console.log("    MATCHED                    x2  (Michal Sror, Efrat Dahan)  -> each has a SCHEDULED Meeting");
  console.log("    CANCELLED                  x1  (Gefen Halevi, mentee withdrew)");
  console.log("    REJECTED                   x1  (Tair Cohen, mentor declined)");
  console.log("  Other mentors: Noa Levi 9102 (1 incoming + 1 matched), Tamar Cohen 9103 (2 incoming),");
  console.log("                 Dana Shapiro 9105 (1 awaiting mentee), Rivka Katz 9104 (none -> empty state).");
  console.log(`${"=".repeat(64)}`);
  console.log("  Open:  http://localhost:3000/app/mentor-area");
  console.log("  Reset: node scripts/seed-scheduling-demo.js --reset");
  console.log(`${"=".repeat(64)}`);

  if (failed > 0) {
    process.exitCode = 1;
    console.error(`\n${failed} consistency check(s) FAILED`);
  }
}

main()
  .catch((e) => {
    console.error("\nSEED ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
