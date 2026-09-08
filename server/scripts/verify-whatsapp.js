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
const w360 = require("../integrations/whatsapp360");
const gemini = require("../integrations/gemini");
const av = require("../services/whatsappAvailability");
const pendingStore = require("../services/whatsappPendingStore");
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

async function unitChecks() {
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

  // 360dialog inbound parsing — Cloud-style nested payload
  const nestedText = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ profile: { name: "Shira" }, wa_id: "972555000111" }],
              messages: [
                { from: "972555000111", id: "wamid.X", timestamp: "1591955533", type: "text", text: { body: "היי" } },
              ],
            },
          },
        ],
      },
    ],
  };
  const pn = w360.parseInbound(nestedText);
  assert("360 inbound: nested text -> kind text", pn.kind === "text");
  assert("360 inbound: extracts from", pn.from === "972555000111");
  assert("360 inbound: extracts text", pn.text === "היי");

  // flat On-Premise payload
  const flat = w360.parseInbound({
    contacts: [{ profile: { name: "x" }, wa_id: "972500000001" }],
    messages: [{ from: "972500000001", type: "text", text: { body: "1" } }],
  });
  assert("360 inbound: flat text -> kind text, from+text", flat.kind === "text" && flat.from === "972500000001" && flat.text === "1");

  // status callback -> ignore
  const st = w360.parseInbound({
    entry: [{ changes: [{ value: { statuses: [{ id: "wamid.Y", recipient_id: "9725...", status: "read", timestamp: "1" }] } }] }],
  });
  assert("360 inbound: status callback -> ignore", st.kind === "ignore" && st.reason === "status-callback");

  // non-text message -> ignore with reason
  const img = w360.parseInbound({
    entry: [{ changes: [{ value: { messages: [{ from: "9725", type: "image", image: { id: "m1" } }] } }] }],
  });
  assert("360 inbound: image message -> ignore(unsupported-message-type)", img.kind === "ignore" && img.reason.startsWith("unsupported-message-type"));

  // garbage / empty
  assert("360 inbound: {} -> ignore", w360.parseInbound({}).kind === "ignore");
  assert("360 inbound: null -> ignore", w360.parseInbound(null).kind === "ignore");
  assert("360 inbound: string -> ignore", w360.parseInbound("nope").kind === "ignore");

  // 360dialog outbound payload shape (text)
  const out = w360.buildOutboundPayload("+972 55-500-0111", "שלום\nעולם");
  assert("360 outbound: messaging_product whatsapp", out.messaging_product === "whatsapp");
  assert("360 outbound: recipient_type individual", out.recipient_type === "individual");
  assert("360 outbound: to is digits only (no +)", out.to === "972555000111");
  assert("360 outbound: type text", out.type === "text");
  assert("360 outbound: text.body preserved incl newline", out.text.body === "שלום\nעולם");

  // ---- action parsing (typed + tapped) ----
  assert('action "היי" -> MENU', wa.parseAction("היי").action === "MENU");
  assert('action "תפריט" -> MENU', wa.parseAction("  תפריט ").action === "MENU");
  assert('action "MAIN_MENU" -> MENU', wa.parseAction("MAIN_MENU").action === "MENU");
  assert('action "1" -> REQUESTS', wa.parseAction("1").action === "REQUESTS");
  assert('action "בקשות" -> REQUESTS', wa.parseAction("בקשות").action === "REQUESTS");
  assert('action "MENTOR_REQUESTS" -> REQUESTS', wa.parseAction("MENTOR_REQUESTS").action === "REQUESTS");
  assert('action "2" -> MEETINGS', wa.parseAction("2").action === "MEETINGS");
  assert('action "UPCOMING_MEETINGS" -> MEETINGS', wa.parseAction("UPCOMING_MEETINGS").action === "MEETINGS");
  assert('action "3" -> HELP', wa.parseAction("3").action === "HELP");
  assert('action "עוד" -> MORE', wa.parseAction("עוד").action === "MORE");
  assert('action "MORE_MENU" -> MORE', wa.parseAction("MORE_MENU").action === "MORE");
  assert('action "MY_PROFILE" -> PROFILE', wa.parseAction("MY_PROFILE").action === "PROFILE");
  {
    const a = wa.parseAction("REQUEST_DETAILS:123");
    assert('action "REQUEST_DETAILS:123"', a.action === "REQUEST_DETAILS" && a.requestId === 123);
    const p = wa.parseAction("PROPOSE_TIMES:77");
    assert('action "PROPOSE_TIMES:77"', p.action === "PROPOSE_TIMES" && p.requestId === 77);
    const d = wa.parseAction("MENTEE_DETAILS:5");
    assert('action "MENTEE_DETAILS:5"', d.action === "MENTEE_DETAILS" && d.requestId === 5);
  }
  assert('action "banana" -> UNKNOWN', wa.parseAction("banana").action === "UNKNOWN");
  assert('action "" -> UNKNOWN', wa.parseAction("").action === "UNKNOWN");
  assert('action "WHATEVER:9" -> UNKNOWN', wa.parseAction("WHATEVER:9").action === "UNKNOWN");

  // ---- 360dialog inbound: interactive button / list taps ----
  const btnTap = w360.parseInbound({
    entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: "S" }, wa_id: "972555000111" }],
      messages: [{ from: "972555000111", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "MENTOR_REQUESTS", title: "📩 בקשות" } } }],
    } }] }],
  });
  assert("360 inbound: button_reply -> kind interactive + replyId", btnTap.kind === "interactive" && btnTap.replyId === "MENTOR_REQUESTS" && btnTap.from === "972555000111");

  const listTap = w360.parseInbound({
    entry: [{ changes: [{ value: {
      messages: [{ from: "972555000111", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "REQUEST_DETAILS:42", title: "מאיה" } } }],
    } }] }],
  });
  assert("360 inbound: list_reply -> replyId carries the id", listTap.kind === "interactive" && listTap.replyId === "REQUEST_DETAILS:42");

  const tmplBtn = w360.parseInbound({
    messages: [{ from: "972555000111", type: "button", button: { payload: "MAIN_MENU", text: "🏠 תפריט ראשי" } }],
  });
  assert("360 inbound: template button -> kind button + payload", tmplBtn.kind === "button" && tmplBtn.replyId === "MAIN_MENU");

  // ---- 360dialog outbound: interactive builders ----
  const bp = w360.buildButtonsPayload("+972555000111", { text: "hi", buttons: [
    { id: "MENTOR_REQUESTS", title: "📩 בקשות" },
    { id: "UPCOMING_MEETINGS", title: "📅 פגישות" },
    { id: "MORE_MENU", title: "✨ עוד" },
    { id: "EXTRA", title: "should be dropped" },
  ] });
  assert("360 outbound buttons: type interactive/button", bp.type === "interactive" && bp.interactive.type === "button");
  assert("360 outbound buttons: capped at 3", bp.interactive.action.buttons.length === 3);
  assert("360 outbound buttons: reply {id,title}", bp.interactive.action.buttons[0].reply.id === "MENTOR_REQUESTS" && bp.interactive.action.buttons[0].reply.title === "📩 בקשות");

  const lp = w360.buildListPayload("+972555000111", { text: "בחרי", list: { button: "בחרי בקשה", sections: [
    { title: "בקשות", rows: [ { id: "REQUEST_DETAILS:1", title: "מאיה", description: "Backend" } ] },
  ] } });
  assert("360 outbound list: type interactive/list", lp.type === "interactive" && lp.interactive.type === "list");
  assert("360 outbound list: row id/title/description", lp.interactive.action.sections[0].rows[0].id === "REQUEST_DETAILS:1" && lp.interactive.action.sections[0].rows[0].description === "Backend");

  // ---- text fallback rendering ----
  const rtButtons = w360.renderReplyAsText({ text: "מה תרצי?", buttons: [{ id: "A", title: "אופ' 1" }, { id: "B", title: "אופ' 2" }] });
  assert("renderReplyAsText: numbers the button titles", rtButtons.includes("1) אופ' 1") && rtButtons.includes("2) אופ' 2"));
  const rtFallback = w360.renderReplyAsText({ text: "short", fallbackText: "FULL TEXT WITH LINK http://x/y" });
  assert("renderReplyAsText: honours explicit fallbackText", rtFallback === "FULL TEXT WITH LINK http://x/y");

  // ---- gemini.normalize: trusts nothing, validates everything ----
  const A = wa.AI_ACTIONS;
  const n1 = gemini.normalize({ action: "MENTOR_REQUESTS", confidence: 0.9 }, A);
  assert("gemini.normalize: valid action kept", n1.action === "MENTOR_REQUESTS" && n1.confidence === 0.9);
  const n2 = gemini.normalize({ action: "DROP_TABLE", confidence: 0.99 }, A);
  assert("gemini.normalize: disallowed action -> UNKNOWN", n2.action === "UNKNOWN");
  const n3 = gemini.normalize({ action: "UPCOMING_MEETINGS", confidence: 5 }, A);
  assert("gemini.normalize: confidence clamped to <=1", n3.confidence === 1);
  const n4 = gemini.normalize({ action: "UPCOMING_MEETINGS", confidence: "x" }, A);
  assert("gemini.normalize: non-numeric confidence -> 0", n4.confidence === 0);
  const n5 = gemini.normalize({ action: "PROPOSE_TIMES", confidence: 0.8, menteeName: "  מאיה  ", timeRange: "bogus" }, A);
  assert("gemini.normalize: entity trimmed, bad timeRange dropped", n5.entities.menteeName === "מאיה" && n5.entities.timeRange === null);
  const n6 = gemini.normalize({ action: "UPCOMING_MEETINGS", confidence: 0.9, entities: { timeRange: "this_week" } }, A);
  assert("gemini.normalize: nested + case-insensitive timeRange", n6.entities.timeRange === "THIS_WEEK");
  const n7 = gemini.normalize({ action: "UNKNOWN", confidence: 0.9, menteeName: "hallucinated" }, A);
  assert("gemini.normalize: UNKNOWN drops entities", !n7.entities.menteeName);

  // ---- classifyIntent: never throws, transport failures -> UNKNOWN/not-ok ----
  const cBadJson = await gemini.classifyIntent("x", A, { transport: async () => { throw new SyntaxError("bad json"); } });
  assert("classifyIntent: invalid JSON -> {ok:false, UNKNOWN}", cBadJson.ok === false && cBadJson.action === "UNKNOWN");
  const cHttp = await gemini.classifyIntent("x", A, { transport: async () => { const e = new Error("boom"); e.status = 503; throw e; } });
  assert("classifyIntent: API/HTTP failure -> {ok:false}", cHttp.ok === false && cHttp.reason === "http-503");
  const cTimeout = await gemini.classifyIntent("x", A, { transport: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } });
  assert("classifyIntent: timeout -> {ok:false}", cTimeout.ok === false);
  const cGood = await gemini.classifyIntent("יש לי בקשות?", A, { transport: async () => ({ action: "MENTOR_REQUESTS", confidence: 0.97 }) });
  assert("classifyIntent: good transport -> {ok:true, mapped}", cGood.ok === true && cGood.action === "MENTOR_REQUESTS");

  // ---- filterUpcomingByRange ----
  const nowT = new Date();
  const mk = (id, offsetMs) => ({ request: { id }, meeting: { status: "SCHEDULED", scheduledStart: new Date(nowT.getTime() + offsetMs).toISOString(), scheduledEnd: new Date(nowT.getTime() + offsetMs + 3600000).toISOString() } });
  const up = [mk(1, 3 * 3600000), mk(2, 26 * 3600000), mk(3, 6 * 86400000)];
  assert("range NEXT_MEETING -> 1", wa.filterUpcomingByRange(up, "NEXT_MEETING", nowT).length === 1);
  assert("range ALL_UPCOMING -> all", wa.filterUpcomingByRange(up, "ALL_UPCOMING", nowT).length === 3);
  assert("range null -> all", wa.filterUpcomingByRange(up, null, nowT).length === 3);
  assert("range THIS_WEEK -> within 7d", wa.filterUpcomingByRange(up, "THIS_WEEK", nowT).length === 3);
  const upFar = [mk(1, 3 * 3600000), mk(2, 10 * 86400000)];
  assert("range THIS_WEEK excludes >7d", wa.filterUpcomingByRange(upFar, "THIS_WEEK", nowT).length === 1);

  // ---- matchRequestsByMenteeName ----
  const reqs = [
    { id: 1, mentee: { fullName: "מאיה כהן" } },
    { id: 2, mentee: { fullName: "מאיה לוי" } },
    { id: 3, mentee: { fullName: "נועה ברק" } },
  ];
  assert("name match: unique first name across 2 -> 2 matches", wa.matchRequestsByMenteeName(reqs, "מאיה").length === 2);
  assert("name match: full name -> 1", wa.matchRequestsByMenteeName(reqs, "נועה ברק").length === 1);
  assert("name match: no match -> 0", wa.matchRequestsByMenteeName(reqs, "רותם").length === 0);
  assert("name match: empty -> 0", wa.matchRequestsByMenteeName(reqs, "").length === 0);

  // ---- gemini.normalizeAvailability ----
  const na1 = gemini.normalizeAvailability({
    confidence: 0.9,
    availability: [
      { day: "sunday", startTime: "17:00", endTime: "19:00" },
      { day: "TUESDAY", startTime: "10", endTime: "13:00" }, // bad startTime -> null
      { day: "NOPE", startTime: "09:00" }, // bad day -> dropped
      { day: "WEDNESDAY", daypart: "evening" },
      { day: "THURSDAY" }, // nothing useful -> dropped
    ],
  });
  assert("normalizeAvailability: keeps valid, drops junk", na1.availability.length === 3);
  assert("normalizeAvailability: uppercases day", na1.availability[0].day === "SUNDAY");
  assert("normalizeAvailability: invalid HH:MM -> null", na1.availability[1].startTime === null && na1.availability[1].endTime === "13:00");
  assert("normalizeAvailability: daypart normalised", na1.availability[2].daypart === "EVENING");
  const na2 = gemini.normalizeAvailability({ confidence: 5, availability: "nope" });
  assert("normalizeAvailability: confidence clamped, non-array -> []", na2.confidence === 1 && na2.availability.length === 0);

  // ---- extractAvailability: never throws ----
  const eaFail = await gemini.extractAvailability("x", { transport: async () => { throw new Error("boom"); } });
  assert("extractAvailability: transport throw -> {ok:false, []}", eaFail.ok === false && eaFail.availability.length === 0);
  const eaGood = await gemini.extractAvailability("ראשון אחרי 17", {
    transport: async () => ({ confidence: 0.9, availability: [{ day: "SUNDAY", startTime: "17:00" }] }),
  });
  assert("extractAvailability: good -> {ok:true, entry}", eaGood.ok === true && eaGood.availability[0].day === "SUNDAY");

  // ---- expandWindow (daypart / open-ended defaults live in the backend) ----
  assert("expandWindow: explicit range", JSON.stringify(av.expandWindow({ startTime: "10:00", endTime: "13:00" })) === "[600,780]");
  assert("expandWindow: EVENING daypart -> 17:00-21:00", JSON.stringify(av.expandWindow({ daypart: "EVENING" })) === `[${17 * 60},${21 * 60}]`);
  assert("expandWindow: 'after 17' -> 17:00 + 4h", JSON.stringify(av.expandWindow({ startTime: "17:00" })) === `[${17 * 60},${21 * 60}]`);
  assert("expandWindow: 'before 15' -> 4h before 15:00", JSON.stringify(av.expandWindow({ endTime: "15:00" })) === `[${11 * 60},${15 * 60}]`);
  assert("expandWindow: nothing -> null", av.expandWindow({ day: "SUNDAY" }) === null);
  assert("expandWindow: end<=start -> null", av.expandWindow({ startTime: "13:00", endTime: "10:00" }) === null);

  // ---- generateCandidateSlots ----
  const sunMorning = new Date("2026-09-13T05:00:00.000Z"); // Sunday ~08:00 IDT
  const g1 = av.generateCandidateSlots(
    [{ day: "SUNDAY", startTime: "17:00", endTime: "19:00" }, { day: "TUESDAY", startTime: "10:00", endTime: "13:00" }],
    45, [], sunMorning
  );
  assert("candidates: 2 windows -> >=2 slots, spread across days", g1.slots.length >= 2 && g1.slots[0].dayToken !== g1.slots[1].dayToken);
  assert("candidates: each slot is 45 min", (new Date(g1.slots[0].endTime) - new Date(g1.slots[0].startTime)) === 45 * 60000);

  // past window today -> rejected
  const sunAfternoon = new Date("2026-09-13T13:00:00.000Z"); // Sunday ~16:00 IDT
  const gPast = av.generateCandidateSlots([{ day: "SUNDAY", startTime: "09:00", endTime: "11:00" }], 45, [], sunAfternoon);
  assert("candidates: fully-past window today -> no slots", gPast.slots.length === 0);

  // conflict with an existing meeting -> that block is skipped
  const tueBusyStart = av.zonedWallToUtc(2026, 9, 15, 10, 0); // Tue 10:00 IDT
  const gConf = av.generateCandidateSlots(
    [{ day: "TUESDAY", startTime: "10:00", endTime: "14:00" }], 45,
    [{ start: tueBusyStart, end: new Date(tueBusyStart.getTime() + 2 * 3600000) }], // busy 10:00-12:00
    sunMorning
  );
  assert("candidates: overlapping busy block skipped (first free at 12:00)",
    gConf.slots.length >= 1 && new Date(gConf.slots[0].startTime).getTime() === tueBusyStart.getTime() + 2 * 3600000);

  assert("candidates: empty availability -> reason no-availability", av.generateCandidateSlots([], 45, [], sunMorning).reason === "no-availability");
  assert("candidates: bad duration -> reason bad-duration", av.generateCandidateSlots([{ day: "SUNDAY", daypart: "EVENING" }], 0, [], sunMorning).reason === "bad-duration");

  // ---- pendingStore: expiry ----
  pendingStore.clear(999001);
  pendingStore.set(999001, { kind: "AWAITING_AVAILABILITY", requestId: 1 });
  assert("pendingStore: fresh entry readable", pendingStore.get(999001) && pendingStore.get(999001).kind === "AWAITING_AVAILABILITY");
  const entry = pendingStore._debug().entries.find((e) => e.userId === 999001);
  entry.expiresAt = Date.now() - 1000; // force-expire (entry is a live reference)
  assert("pendingStore: expired entry -> get() returns null", pendingStore.get(999001) === null);
  pendingStore.clear(999001);
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
  const req1 = await prisma.mentoringRequest.create({
    data: { menteeId: menteeA.id, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" },
  });

  const send = (from, body) => wa.handleIncomingMessage({ from, body });
  const btnIds = (r) => (r.buttons || []).map((b) => b.id);

  // 1. greeting -> personalised interactive menu
  {
    const r = await send(`whatsapp:${PHONE}`, "היי");
    assert("greeting: personalised with mentor name", r.text.includes("דנה בדיקה"));
    assert("greeting: 3 main-menu buttons with stable ids",
      btnIds(r).join(",") === "MENTOR_REQUESTS,UPCOMING_MEETINGS,MORE_MENU");
  }

  // 2. "1" AND the tapped button id -> same real pending-request screen
  for (const input of ["1", "MENTOR_REQUESTS"]) {
    const r = await send(`whatsapp:${PHONE}`, input);
    assert(`pending (${input}): interactive list row for the fixture request`,
      Boolean(r.list) && r.list.sections[0].rows[0].id === `REQUEST_DETAILS:${req1.id}`);
    assert(`pending (${input}): row shows mentee name`, r.list.sections[0].rows[0].title.includes("מאיה מבחן"));
    assert(`pending (${input}): fallbackText keeps name + summary + deep link`,
      r.fallbackText.includes("מאיה מבחן") &&
      r.fallbackText.includes("Backend Engineer") &&
      r.fallbackText.includes("Node.js") &&
      r.fallbackText.includes(`/app/mentor-area/requests/${req1.id}/propose-slots`));
  }

  // 3. tap a request row -> details + propose-times link + a way back
  {
    const r = await send(`whatsapp:${PHONE}`, `REQUEST_DETAILS:${req1.id}`);
    assert("request details: mentee name + propose link",
      r.text.includes("מאיה מבחן") && r.text.includes(`/app/mentor-area/requests/${req1.id}/propose-slots`));
    assert("request details: back buttons present", btnIds(r).includes("MENTOR_REQUESTS") && btnIds(r).includes("MAIN_MENU"));
  }

  // 4. stale / not-owned request id -> graceful, never crashes, has a way back
  {
    const r = await send(`whatsapp:${PHONE}`, "REQUEST_DETAILS:99999999");
    assert("stale request id -> friendly 'no longer waiting' + home", r.text.includes("כבר לא ממתינה") && btnIds(r).includes("MAIN_MENU"));
    const r2 = await send(`whatsapp:${PHONE}`, "PROPOSE_TIMES:99999999");
    assert("stale propose-times id -> same graceful screen", r2.text.includes("כבר לא ממתינה"));
  }

  // 5. "2" -> no upcoming meetings for this fixture, still a way home
  {
    const r = await send(`whatsapp:${PHONE}`, "2");
    assert("meetings: none scheduled -> friendly line + home", r.text.includes("אין לך פגישות מתוזמנות כרגע") && btnIds(r).includes("MAIN_MENU"));
  }

  // 6. MORE submenu + MY_PROFILE
  {
    const more = await send(`whatsapp:${PHONE}`, "MORE_MENU");
    assert("more menu: profile/help/home buttons", btnIds(more).join(",") === "MY_PROFILE,HELP,MAIN_MENU");
    const prof = await send(`whatsapp:${PHONE}`, "MY_PROFILE");
    assert("profile: shows counts + name", prof.text.includes("דנה בדיקה") && prof.text.includes("בקשות שמחכות: 1"));
  }

  // 7. help + unrecognised free text -> always a path back
  {
    const help = await send(`whatsapp:${PHONE}`, "3");
    assert("help: text + home button", help.text.includes("עזרה") && btnIds(help).includes("MAIN_MENU"));
    // Free text the deterministic parser can't place goes to the AI fallback
    // menu. Stub the classifier so this stays deterministic even with a live key.
    const _real = gemini.classifyIntent;
    gemini.classifyIntent = async () => ({ ok: true, action: "UNKNOWN", confidence: 0, entities: {} });
    try {
      const unk = await send(`whatsapp:${PHONE}`, "askjdh qwerty");
      assert("unrecognised free text -> 'לא בטוחה שהבנתי' + menu buttons",
        unk.text.includes("לא בטוחה שהבנתי") && btnIds(unk).length >= 2);
    } finally {
      gemini.classifyIntent = _real;
    }
  }

  // 8. unknown number
  {
    const { text } = await send("whatsapp:+972500000000", "היי");
    assert("unknown number -> friendly, not an error", text.includes("לא זיהיתי את המספר"));
  }

  // 9. known user, not a mentor -> exact spec wording
  {
    const { text } = await send("whatsapp:+972555000222", "היי");
    assert("non-mentor -> 'הממשק זמין כרגע למנטוריות בלבד'", text === "הממשק זמין כרגע למנטוריות בלבד");
  }

  // 10. normalized match: local-format sender resolves to the same mentor
  {
    const { text } = await send("whatsapp:0555000111", "שלום");
    assert("local-format sender normalises to the enrolled mentor", text.includes("דנה בדיקה"));
  }

  // ---- 11. AI natural-language layer (Gemini stubbed) ----------------------
  // whatsappService calls gemini.classifyIntent(...) as a live property, so
  // swapping it here is a real injection seam. Always restored.
  const realClassify = gemini.classifyIntent;
  const stub = (impl) => { gemini.classifyIntent = impl; };
  const restore = () => { gemini.classifyIntent = realClassify; };
  const btnIdsOf = (r) => (r.buttons || []).map((b) => b.id);

  try {
    // 11a. deterministic input NEVER reaches Gemini
    {
      let called = 0;
      stub(async () => { called++; return { ok: true, action: "MENTOR_REQUESTS", confidence: 1, entities: {} }; });
      await send(`whatsapp:${PHONE}`, "היי");
      await send(`whatsapp:${PHONE}`, "1");
      await send(`whatsapp:${PHONE}`, "תפריט");
      await send(`whatsapp:${PHONE}`, "MENTOR_REQUESTS");
      assert("AI: deterministic commands + button ids bypass Gemini entirely", called === 0);
    }

    // 11b. high-confidence valid intent -> SAME handler as the button
    {
      stub(async () => ({ ok: true, action: "MENTOR_REQUESTS", confidence: 0.97, entities: {} }));
      const ai = await send(`whatsapp:${PHONE}`, "מי מחכה לתשובה ממני?");
      const btn = await send(`whatsapp:${PHONE}`, "MENTOR_REQUESTS");
      assert("AI: 'who is waiting for me' -> requests screen (same as button)",
        Boolean(ai.list) && ai.list.sections[0].rows[0].id === btn.list.sections[0].rows[0].id);
    }

    // 11c. UPCOMING_MEETINGS + timeRange entity
    {
      stub(async () => ({ ok: true, action: "UPCOMING_MEETINGS", confidence: 0.9, entities: { timeRange: "THIS_WEEK" } }));
      const r = await send(`whatsapp:${PHONE}`, "מה יש לי השבוע?");
      assert("AI: 'what do I have this week' -> meetings screen", r.text.includes("פגישות") || r.text.includes("פגישה"));
      assert("AI: meetings screen still has a way home", btnIdsOf(r).includes("MAIN_MENU"));
    }

    // 11d. unsupported model action -> menu fallback (never dispatched)
    {
      stub(async () => ({ ok: true, action: "REJECT_REQUEST", confidence: 0.99, entities: {} }));
      const r = await send(`whatsapp:${PHONE}`, "תמחקי הכל");
      assert("AI: disallowed action -> 'לא בטוחה שהבנתי' menu", r.text.includes("לא בטוחה שהבנתי") && btnIdsOf(r).includes("MENTOR_REQUESTS"));
    }

    // 11e. low confidence -> menu fallback
    {
      stub(async () => ({ ok: true, action: "MENTOR_REQUESTS", confidence: 0.4, entities: {} }));
      const r = await send(`whatsapp:${PHONE}`, "אולי בקשות? לא בטוחה");
      assert("AI: confidence < 0.75 -> menu fallback", r.text.includes("לא בטוחה שהבנתי"));
    }

    // 11f. Gemini failure / invalid JSON / timeout -> menu fallback
    {
      stub(async () => { throw new Error("network down"); });
      const r1 = await send(`whatsapp:${PHONE}`, "משהו חופשי לגמרי");
      assert("AI: classifier throws -> menu fallback (never crashes)", r1.text.includes("לא בטוחה שהבנתי"));
      stub(async () => ({ ok: false, action: "UNKNOWN", confidence: 0, entities: {}, reason: "http-500" }));
      const r2 = await send(`whatsapp:${PHONE}`, "עוד משהו חופשי");
      assert("AI: {ok:false} -> menu fallback", r2.text.includes("לא בטוחה שהבנתי"));
    }

    // 11g. extracted mentee name STILL goes through backend ownership/state check.
    // A confident PROPOSE_TIMES + a name that matches exactly one of HER pending
    // requests goes straight into the WhatsApp availability capture flow.
    {
      pendingStore.clear(mentorUser.id);
      stub(async () => ({ ok: true, action: "PROPOSE_TIMES", confidence: 0.92, entities: { menteeName: "מאיה מבחן" } }));
      const r = await send(`whatsapp:${PHONE}`, "אני רוצה להציע שעות למאיה מבחן");
      assert("AI: named PROPOSE_TIMES -> backend-resolved request -> availability capture",
        r.text.includes("מאיה מבחן") && r.text.includes("מתי את פנויה"));
      pendingStore.clear(mentorUser.id); // don't leak the multi-step state into later tests

      stub(async () => ({ ok: true, action: "PROPOSE_TIMES", confidence: 0.92, entities: { menteeName: "מישהי שלא קיימת" } }));
      const r2 = await send(`whatsapp:${PHONE}`, "להציע שעות למישהי שלא קיימת");
      assert("AI: unknown name -> 'no open request', never guesses a request",
        r2.text.includes("לא מצאתי בקשה"));
      pendingStore.clear(mentorUser.id);
    }

    // 11h. unknown natural-language question -> fallback menu
    {
      pendingStore.clear(mentorUser.id);
      stub(async () => ({ ok: true, action: "UNKNOWN", confidence: 0, entities: {} }));
      const r = await send(`whatsapp:${PHONE}`, "מה כדאי לי לאכול היום?");
      assert("AI: off-topic -> 'לא בטוחה שהבנתי' + existing menu buttons",
        r.text.includes("לא בטוחה שהבנתי") && btnIdsOf(r).length >= 2);
    }

    // 11i. button flow keeps working even while the classifier would throw
    {
      stub(async () => { throw new Error("still down"); });
      const r = await send(`whatsapp:${PHONE}`, "MENTOR_REQUESTS");
      assert("AI down: interactive button flow unaffected", Boolean(r.list));
    }
  } finally {
    restore();
  }

  // 11j. GEMINI_API_KEY absent -> classifier reports not-configured -> fallback
  {
    const hadKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const r = await send(`whatsapp:${PHONE}`, "טקסט חופשי בלי מפתח");
    assert("AI: no GEMINI_API_KEY -> menu fallback, deterministic path intact", r.text.includes("לא בטוחה שהבנתי"));
    const stillWorks = await send(`whatsapp:${PHONE}`, "1");
    assert("AI: no key -> '1' still returns real requests", Boolean(stillWorks.list));
    if (hadKey !== undefined) process.env.GEMINI_API_KEY = hadKey;
  }

  // ---- 12. AI "propose times from WhatsApp" flow (Gemini stubbed) ---------
  const realExtract = gemini.extractAvailability;
  const stubE = (impl) => { gemini.extractAvailability = impl; };
  const uid = mentorUser.id;
  const roundCount = (rid) => prisma.schedulingRound.count({ where: { requestId: rid } });
  const statusOf = (rid) => prisma.mentoringRequest.findUnique({ where: { id: rid }, select: { status: true } }).then((x) => x.status);
  const tokenFrom = (reply) => {
    const b = (reply.buttons || []).find((x) => x.id.startsWith("CONFIRM_PROPOSE_TIMES:"));
    return b ? b.id.slice("CONFIRM_PROPOSE_TIMES:".length) : null;
  };
  const menteeB = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}menteeB@local`, passwordHash: "x", fullName: "נועה מבחן", jobTitle: "QA" },
  });
  const reqB = await prisma.mentoringRequest.create({ data: { menteeId: menteeB.id, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" } });
  const reqC = await prisma.mentoringRequest.create({ data: { menteeId: menteeB.id, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" } });
  const reqD = await prisma.mentoringRequest.create({ data: { menteeId: menteeB.id, mentorProfileId: mentorProfile.id, status: "WAITING_FOR_MENTOR_SLOTS" } });

  const farSun = "SUNDAY", farTue = "TUESDAY";
  const availOK = { ok: true, confidence: 0.95, availability: [
    { day: farSun, startTime: "17:00", endTime: "20:00", daypart: null },
    { day: farTue, startTime: "10:00", endTime: "13:00", daypart: null },
  ] };

  try {
    // 12a. start flow -> availability prompt, pending set (no DB write)
    {
      pendingStore.clear(uid);
      const r = await wa.startAvailabilityFlow(reqB.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      assert("propose-AI: start -> 'כתבי מתי את פנויה' + cancel button",
        r.text.includes("מתי את פנויה") && (r.buttons || []).some((b) => b.id === "CANCEL_PROPOSE_TIMES"));
      assert("propose-AI: pending is AWAITING_AVAILABILITY", pendingStore.get(uid).kind === "AWAITING_AVAILABILITY");
    }

    // 12b. availability text -> preview (still NO DB write)  [tests 1,2,3,6,8]
    let previewToken;
    {
      stubE(async () => availOK);
      const r = await send(`whatsapp:${PHONE}`, "ראשון אחרי 17 ושלישי בין 10 ל-13");
      assert("propose-AI: preview lists candidate slots", r.text.includes("מצאתי") && (r.text.match(/•/g) || []).length >= 2);
      assert("propose-AI: preview offers confirm/retry/cancel",
        (r.buttons || []).some((b) => b.id.startsWith("CONFIRM_PROPOSE_TIMES:")) &&
        (r.buttons || []).some((b) => b.id === `RETRY_PROPOSE_TIMES:${reqB.id}`) &&
        (r.buttons || []).some((b) => b.id === "CANCEL_PROPOSE_TIMES"));
      previewToken = tokenFrom(r);
      assert("propose-AI: PREVIEW DID NOT WRITE (status + 0 rounds)",
        (await statusOf(reqB.id)) === "WAITING_FOR_MENTOR_SLOTS" && (await roundCount(reqB.id)) === 0);
    }

    // 12c. confirm -> existing schedulingService.proposeSlots runs  [tests 6,9]
    {
      const r = await send(`whatsapp:${PHONE}`, `CONFIRM_PROPOSE_TIMES:${previewToken}`);
      assert("propose-AI: confirm -> 'שלחתי' success reply", r.text.includes("שלחתי"));
      assert("propose-AI: request now WAITING_FOR_MENTEE_SELECTION (real state machine)",
        (await statusOf(reqB.id)) === "WAITING_FOR_MENTEE_SELECTION");
      const round = await prisma.schedulingRound.findFirst({ where: { requestId: reqB.id }, include: { offeredSlots: true } });
      assert("propose-AI: a SchedulingRound with 2-3 OfferedSlots was created",
        Boolean(round) && round.offeredSlots.length >= 2 && round.offeredSlots.length <= 3);
      assert("propose-AI: pending cleared after confirm", pendingStore.get(uid) === null);
    }

    // 12d. daypart-only availability -> still builds a preview  [test 2]
    {
      stubE(async () => ({ ok: true, confidence: 0.9, availability: [
        { day: "WEDNESDAY", startTime: null, endTime: null, daypart: "EVENING" },
        { day: "THURSDAY", startTime: null, endTime: null, daypart: "MORNING" },
      ] }));
      await wa.startAvailabilityFlow(reqC.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      const r = await send(`whatsapp:${PHONE}`, "רביעי בערב וחמישי בבוקר");
      assert("propose-AI: daypart-only -> preview with slots", r.text.includes("מצאתי") && (r.text.match(/•/g) || []).length >= 2);
      pendingStore.clear(uid);
    }

    // 12e. vague / low-confidence -> clarification, pending kept  [tests 4,12]
    {
      stubE(async () => ({ ok: true, confidence: 0.2, availability: [] }));
      await wa.startAvailabilityFlow(reqC.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      const r = await send(`whatsapp:${PHONE}`, "מתישהו אולי");
      assert("propose-AI: unusable availability -> 'לא הצלחתי להבין מספיק טוב' + retry",
        r.text.includes("לא הצלחתי להבין מספיק טוב") && (r.buttons || []).some((b) => b.id === `RETRY_PROPOSE_TIMES:${reqC.id}`));
      assert("propose-AI: still AWAITING_AVAILABILITY so she can retype", pendingStore.get(uid).kind === "AWAITING_AVAILABILITY");
      pendingStore.clear(uid);
    }

    // 12f. Gemini unavailable during availability step -> clarification  [test 12]
    {
      stubE(async () => { throw new Error("gemini down"); });
      await wa.startAvailabilityFlow(reqC.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      const r = await send(`whatsapp:${PHONE}`, "ראשון אחרי 17");
      assert("propose-AI: extractor throws -> clarification, never crashes", r.text.includes("לא הצלחתי להבין מספיק טוב"));
      pendingStore.clear(uid);
    }

    // 12g. stale request at confirmation -> safe failure, no bypass  [test 10]
    {
      stubE(async () => availOK);
      await wa.startAvailabilityFlow(reqD.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      const preview = await send(`whatsapp:${PHONE}`, "ראשון אחרי 17 ושלישי בין 10 ל-13");
      const tok = tokenFrom(preview);
      // the request moves on between preview and confirm (e.g. mentee withdrew)
      await prisma.mentoringRequest.update({ where: { id: reqD.id }, data: { status: "CANCELLED" } });
      const r = await send(`whatsapp:${PHONE}`, `CONFIRM_PROPOSE_TIMES:${tok}`);
      assert("propose-AI: stale at confirm -> 'הבקשה השתנתה מאז' (state machine not bypassed)",
        r.text.includes("הבקשה השתנתה מאז"));
      assert("propose-AI: stale request stayed CANCELLED, no round created",
        (await statusOf(reqD.id)) === "CANCELLED" && (await roundCount(reqD.id)) === 0);
      pendingStore.clear(uid);
    }

    // 12h. expired pending confirmation -> safe failure  [test 11]
    {
      stubE(async () => availOK);
      await wa.startAvailabilityFlow(reqC.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      const preview = await send(`whatsapp:${PHONE}`, "ראשון אחרי 17 ושלישי בין 10 ל-13");
      const tok = tokenFrom(preview);
      const e = pendingStore._debug().entries.find((x) => x.userId === uid);
      if (e) e.expiresAt = Date.now() - 1000; // force expiry
      const r = await send(`whatsapp:${PHONE}`, `CONFIRM_PROPOSE_TIMES:${tok}`);
      assert("propose-AI: expired confirmation -> 'לא מצאתי הצעה פעילה'", r.text.includes("לא מצאתי הצעה פעילה"));
      pendingStore.clear(uid);
    }

    // 12i. deterministic command mid-flow abandons it cleanly  [test 13]
    {
      stubE(async () => availOK);
      await wa.startAvailabilityFlow(reqC.id, { user: mentorUser, mentorProfileId: mentorProfile.id });
      assert("propose-AI: pending set before interruption", pendingStore.get(uid) !== null);
      const r = await send(`whatsapp:${PHONE}`, "1"); // she taps a menu command instead
      assert("propose-AI: '1' mid-flow -> requests screen, pending cleared",
        Boolean(r.list) && pendingStore.get(uid) === null);
    }
  } finally {
    gemini.extractAvailability = realExtract;
    pendingStore.clear(uid);
  }
}

async function main() {
  await cleanup();
  await unitChecks();
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
