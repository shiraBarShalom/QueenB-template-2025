/* eslint-disable no-console */
// ============================================================================
// Manual verification for the WhatsApp Companion (feature/whatsapp-mentor).
// ============================================================================
// Plain Node script (the project has no test runner), same shape as
// scripts/verify-scheduling.js:
//   1. unit-checks the pure helpers (phone normalization, intent parsing,
//      list formatting) with NO database,
//   2. creates isolated fixtures (emails prefixed "wa.verify."), drives
//      whatsappService.handleIncomingMessage end to end against Postgres, and
//      asserts the replies,
//   3. deletes its fixtures (FK-safe) at start and end.
//
// It NEVER calls schedulingService and NEVER writes MentoringRequest.status /
// retryCount / Meeting / SchedulingRound / OfferedSlot beyond creating plain
// fixture rows — exactly like verify-scheduling.js seeds its own data.
//
// Run:  node scripts/verify-whatsapp.js
// Exit: 0 = all passed, 1 = at least one failure.
// ============================================================================

const prisma = require("../prismaClient");
const { normalizeE164, extractWhatsAppNumber, isE164 } = require("../utils/phone");
const { twiml } = require("../integrations/twilio");
const wa = require("../services/whatsappService");

let passed = 0;
let failed = 0;
const ok = (n) => (passed++, console.log(`  ✓ ${n}`));
const bad = (n, d = "") => (failed++, console.log(`  ✗ ${n}\n      ${d}`));
const assert = (n, cond, d = "") => (cond ? ok(n) : bad(n, d || "assertion false"));

const EMAIL_PREFIX = "wa.verify.";
const PHONE = "+972555000111"; // fictitious, never a real Sandbox number

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
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
    where: {
      OR: [{ menteeId: { in: userIds } }, { mentorProfileId: { in: profileIds } }],
    },
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

function unitChecks() {
  console.log("\n[U] Pure helpers (no DB)");

  // phone
  assert('normalize "whatsapp:+972 50-123-4567"', normalizeE164("whatsapp:+972 50-123-4567") === "+972501234567");
  assert('normalize local "0501234567" -> +972', normalizeE164("0501234567") === "+972501234567");
  assert('normalize "00972501234567"', normalizeE164("00972501234567") === "+972501234567");
  assert("normalize empty -> null", normalizeE164("  ") === null);
  assert('extractWhatsAppNumber strips prefix', extractWhatsAppNumber("whatsapp:+14155550123") === "+14155550123");
  assert("isE164 accepts +14155550123", isE164("+14155550123") === true);
  assert("isE164 rejects 05012", isE164("05012") === false);

  // intent
  assert('intent "היי" -> menu', wa.parseIntent("היי") === "menu");
  assert('intent " שלום " -> menu', wa.parseIntent("  שלום ") === "menu");
  assert('intent "Hello" -> menu', wa.parseIntent("Hello") === "menu");
  assert('intent "תפריט" -> menu', wa.parseIntent("תפריט") === "menu");
  assert('intent "1" -> pending', wa.parseIntent("1") === "pending");
  assert('intent "בקשות" -> pending', wa.parseIntent("בקשות") === "pending");
  assert('intent "2" -> meetings', wa.parseIntent("2") === "meetings");
  assert('intent "פגישות" -> meetings', wa.parseIntent("פגישות") === "meetings");
  assert('intent "3" -> help', wa.parseIntent("3") === "help");
  assert('intent "help" -> help', wa.parseIntent("help") === "help");
  assert('intent "עזרה" -> help', wa.parseIntent("עזרה") === "help");
  assert('intent "בלה בלה" -> unknown', wa.parseIntent("בלה בלה") === "unknown");
  assert('intent "" -> unknown', wa.parseIntent("") === "unknown");

  // formatting — pending
  assert("empty pending -> flower line", wa.formatPending([]).includes("אין לך בקשות שמחכות לתגובה כרגע 🌸"));
  const pend = wa.formatPending([
    { id: 11, mentee: { fullName: "מאיה כהן", jobTitle: "Backend Engineer", technologies: [{ name: "Node.js" }, { name: "SQL" }] } },
    { id: 12, mentee: { fullName: "נועה לוי", jobTitle: "Data", technologies: [{ name: "Python" }] } },
    { id: 13, mentee: { fullName: "רות", technologies: [] } },
    { id: 14, mentee: { fullName: "extra", technologies: [] } },
  ]);
  assert("pending: header counts 4", pend.includes("יש לך 4 בקשות"));
  assert("pending: shows mentee name", pend.includes("מאיה כהן"));
  assert("pending: shows summary line", pend.includes("Backend Engineer · Node.js, SQL"));
  assert("pending: includes propose-slots deep link", pend.includes("/app/mentor-area/requests/11/propose-slots"));
  assert("pending: collapses the 4th into 'ועוד'", pend.includes("ועוד 1 בקשות"));
  assert("pending: single -> 'בקשה אחת'", wa.formatPending([{ id: 9, mentee: { fullName: "x", technologies: [] } }]).includes("בקשה אחת"));

  // formatting — meetings
  assert("no meetings -> line", wa.formatMeetings([]).includes("אין לך פגישות מתוזמנות כרגע"));
  const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  const soonEnd = new Date(soon.getTime() + 60 * 60 * 1000);
  const past = new Date(Date.now() - 3600 * 1000);
  const mtg = wa.formatMeetings([
    { id: 1, mentee: { fullName: "מאיה כהן" }, meeting: { status: "SCHEDULED", scheduledStart: soon.toISOString(), scheduledEnd: soonEnd.toISOString() } },
    { id: 2, mentee: { fullName: "עבר" }, meeting: { status: "SCHEDULED", scheduledStart: past.toISOString(), scheduledEnd: new Date(past.getTime() + 3600000).toISOString() } },
    { id: 3, mentee: { fullName: "מבוטלת" }, meeting: { status: "CANCELLED", scheduledStart: soon.toISOString(), scheduledEnd: soonEnd.toISOString() } },
  ]);
  assert("meetings: shows the future SCHEDULED one", mtg.includes("מאיה כהן") && mtg.includes("הפגישה הקרובה שלך"));
  assert("meetings: hides the past meeting", !mtg.includes("עבר"));
  assert("meetings: hides the CANCELLED meeting", !mtg.includes("מבוטלת"));

  // upcomingMeetings ordering
  const order = wa.upcomingMeetings([
    { id: 1, meeting: { status: "SCHEDULED", scheduledStart: new Date(Date.now() + 5 * 86400000).toISOString(), scheduledEnd: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString() } },
    { id: 2, meeting: { status: "SCHEDULED", scheduledStart: new Date(Date.now() + 2 * 86400000).toISOString(), scheduledEnd: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString() } },
  ]);
  assert("upcomingMeetings sorts soonest-first", order[0].request.id === 2 && order[1].request.id === 1);

  // twiml escaping
  const xml = twiml("a<b>&'\"c");
  assert("twiml wraps in <Response><Message>", xml.includes("<Response>") && xml.includes("<Message>"));
  assert("twiml escapes markup", xml.includes("&lt;b&gt;") && !xml.includes("<b>"));
}

async function dbChecks() {
  console.log("\n[D] End-to-end via handleIncomingMessage (DB)");

  // --- fixtures ---
  const mentorUser = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}mentor@local`,
      passwordHash: "x",
      fullName: "דנה בדיקה",
      whatsappPhone: PHONE,
    },
  });
  const mentorProfile = await prisma.mentorProfile.create({
    data: { userId: mentorUser.id, background: "bg", meetingCapacity: 5, meetingDurationMinutes: 30 },
  });
  const menteeA = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}menteeA@local`,
      passwordHash: "x",
      fullName: "מאיה מבחן",
      jobTitle: "Backend Engineer",
      technologies: { connectOrCreate: [{ where: { name: "Node.js" }, create: { name: "Node.js" } }] },
    },
  });
  const plainUser = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}plain@local`, passwordHash: "x", fullName: "לא מנטורית", whatsappPhone: "+972555000222" },
  });

  // One pending request (fixture row only — no scheduling transition invoked).
  await prisma.mentoringRequest.create({
    data: { menteeId: menteeA.id, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" },
  });

  const send = (from, body) => wa.handleIncomingMessage({ from, body });

  // 1. greeting -> personalised menu
  {
    const { text } = await send(`whatsapp:${PHONE}`, "היי");
    assert("greeting: personalised with mentor name", text.includes("דנה בדיקה"));
    assert("greeting: shows the 3 numbered options",
      text.includes("1. בקשות שמחכות לי") && text.includes("2. פגישות קרובות") && text.includes("3. עזרה"));
  }

  // 2. "1" -> real pending request from Postgres
  {
    const { text } = await send(`whatsapp:${PHONE}`, "1");
    assert("pending: reads the fixture request", text.includes("מאיה מבחן"));
    assert("pending: summary from real mentee fields", text.includes("Backend Engineer") && text.includes("Node.js"));
    assert("pending: propose-slots deep link present", /\/app\/mentor-area\/requests\/\d+\/propose-slots/.test(text));
  }

  // 3. "2" -> no upcoming meetings for this fixture
  {
    const { text } = await send(`whatsapp:${PHONE}`, "2");
    assert("meetings: none scheduled -> friendly line", text.includes("אין לך פגישות מתוזמנות כרגע"));
  }

  // 4. help + unknown text
  {
    assert("help intent", (await send(`whatsapp:${PHONE}`, "3")).text.includes("עזרה"));
    assert("unknown text", (await send(`whatsapp:${PHONE}`, "askjdh")).text.includes("לא הצלחתי להבין"));
  }

  // 5. unknown number
  {
    const { text } = await send("whatsapp:+972500000000", "היי");
    assert("unknown number -> friendly, not an error", text.includes("לא זיהיתי את המספר"));
  }

  // 6. known user, not a mentor -> exact spec wording
  {
    const { text } = await send("whatsapp:+972555000222", "היי");
    assert("non-mentor -> 'הממשק זמין כרגע למנטוריות בלבד'", text === "הממשק זמין כרגע למנטוריות בלבד");
  }

  // 7. normalized match: local-format sender resolves to the same mentor
  {
    const { text } = await send("whatsapp:0555000111", "שלום");
    assert("local-format sender normalises to the enrolled mentor", text.includes("דנה בדיקה"));
  }
}

async function main() {
  await cleanup();
  unitChecks();
  await dbChecks();
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
