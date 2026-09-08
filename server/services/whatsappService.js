// ============================================================================
// WhatsApp Companion for mentors — the interface layer, NOT a business layer.
// ============================================================================
// WhatsApp is just another entry point into Match Queens. This module:
//   1. resolves the sender's phone number to a User -> MentorProfile,
//   2. parses a stateless ACTION from either a typed command or a tapped
//      interactive button/list id,
//   3. reads EXISTING data through requestService.getMentorDashboard, and
//   4. returns a PROVIDER-INDEPENDENT reply object:
//        { text, buttons?: [{id,title}], list?: {...}, fallbackText? }
//      integrations/whatsapp360.js decides how that renders on WhatsApp
//      (interactive buttons/list, with automatic plain-text fallback).
//
// HARD RULES (unchanged):
//   * READ-ONLY. Never writes MentoringRequest.status / retryCount / Meeting /
//     SchedulingRound / OfferedSlot. "Propose times" is only ever a deep link
//     to the EXISTING React page — the single scheduling write path.
//   * No conversation state. Every message re-resolves identity and re-parses
//     the action. Button ids carry the context (e.g. "REQUEST_DETAILS:123");
//     ownership + current state are always re-checked against the DB.
//   * Reuses requestService.getMentorDashboard — no duplicate Prisma queries.
//   * Text commands remain a first-class fallback: 1 / בקשות, 2 / פגישות,
//     3 / עזרה, תפריט, היי, שלום, hi, hello, menu.
// ============================================================================

const crypto = require("crypto");
const prisma = require("../prismaClient");
const requestService = require("./requestService");
// schedulingService is used ONLY for read helpers (getMentorBusyIntervals) and,
// on EXPLICIT mentor confirmation, the existing proposeSlots write. No new
// scheduling logic is added here and its rules are never re-implemented.
const schedulingService = require("./schedulingService");
const { extractWhatsAppNumber } = require("../utils/phone");
const gemini = require("../integrations/gemini");
const pendingStore = require("./whatsappPendingStore");
const avail = require("./whatsappAvailability");

// How many rows to spell out in a text list before "ועוד X".
const MAX_LIST = 3;
// Interactive list rows shown for the requests screen (WhatsApp hard cap is 10).
const MAX_REQUEST_ROWS = 8;

const TZ = process.env.MAIL_TZ || "Asia/Jerusalem";

const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  process.env.CLIENT_ORIGIN ||
  "http://localhost:3000"
).replace(/\/+$/, "");

// ----------------------------------------------------------------------------
// Stable internal button / list ids (the WIRE ids; Hebrew is only the label).
// ----------------------------------------------------------------------------
const ID = {
  MAIN_MENU: "MAIN_MENU",
  MORE_MENU: "MORE_MENU",
  MENTOR_REQUESTS: "MENTOR_REQUESTS",
  UPCOMING_MEETINGS: "UPCOMING_MEETINGS",
  HELP: "HELP",
  MY_PROFILE: "MY_PROFILE",
  REQUEST_DETAILS: "REQUEST_DETAILS", // + ":<requestId>"
  PROPOSE_TIMES: "PROPOSE_TIMES", // + ":<requestId>"
  MENTEE_DETAILS: "MENTEE_DETAILS", // + ":<requestId>"
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
  // AI "propose times from WhatsApp" multi-step flow.
  PROPOSE_TIMES_AI: "PROPOSE_TIMES_AI", // + ":<requestId>"  start availability capture
  CONFIRM_PROPOSE_TIMES: "CONFIRM_PROPOSE_TIMES", // + ":<token>"  send the previewed slots
  RETRY_PROPOSE_TIMES: "RETRY_PROPOSE_TIMES", // + ":<requestId>"  re-ask for availability
  CANCEL_PROPOSE_TIMES: "CANCEL_PROPOSE_TIMES", // abort the flow
};

// ----------------------------------------------------------------------------
// AI layer config. Gemini may only ever resolve a natural-language message to
// ONE of these EXISTING actions (or UNKNOWN -> menu fallback). The deterministic
// handlers below are the single implementation; the AI path just picks which
// one to run. Threshold is deliberately conservative.
// ----------------------------------------------------------------------------
const AI_ACTIONS = [
  ID.MAIN_MENU,
  ID.MENTOR_REQUESTS,
  ID.UPCOMING_MEETINGS,
  ID.MORE_MENU,
  ID.HELP,
  ID.MY_PROFILE,
  ID.REQUEST_DETAILS,
  ID.PROPOSE_TIMES,
  ID.NEEDS_ATTENTION,
];
const AI_CONFIDENCE_THRESHOLD = 0.75;
// Actions the model must not use without an explicit person name in the message.
const AI_ACTIONS_REQUIRING_NAME = [ID.REQUEST_DETAILS, ID.PROPOSE_TIMES];

const BTN = {
  requests: { id: ID.MENTOR_REQUESTS, title: "📩 בקשות" },
  meetings: { id: ID.UPCOMING_MEETINGS, title: "📅 פגישות" },
  more: { id: ID.MORE_MENU, title: "✨ עוד" },
  profile: { id: ID.MY_PROFILE, title: "👤 הפרופיל שלי" },
  help: { id: ID.HELP, title: "❓ עזרה" },
  home: { id: ID.MAIN_MENU, title: "🏠 תפריט ראשי" },
  backToRequests: { id: ID.MENTOR_REQUESTS, title: "⬅️ חזרה לבקשות" },
  cancelProposeTimes: { id: ID.CANCEL_PROPOSE_TIMES, title: "❌ ביטול" },
};

// ----------------------------------------------------------------------------
// Action parsing — stateless. Accepts a typed command OR a tapped id.
// Returns { action, requestId? }.
// ----------------------------------------------------------------------------
const GREETING_WORDS = ["היי", "שלום", "hi", "hello", "hey", "menu", "תפריט", "start"];
const REQUESTS_WORDS = ["1", "בקשות", "בקשות שמחכות לי"];
const MEETINGS_WORDS = ["2", "פגישות", "פגישות קרובות"];
const HELP_WORDS = ["3", "עזרה", "help"];
const MORE_WORDS = ["4", "עוד"];
const PROFILE_WORDS = ["פרופיל", "הפרופיל שלי", "profile"];

// Kept (unchanged signature/return) — some tests and older callers use it.
// "menu" | "pending" | "meetings" | "help" | "unknown"
function parseIntent(rawBody) {
  const text = String(rawBody == null ? "" : rawBody).trim().toLowerCase();
  if (!text) return "unknown";
  if (GREETING_WORDS.includes(text)) return "menu";
  if (REQUESTS_WORDS.includes(text)) return "pending";
  if (MEETINGS_WORDS.includes(text)) return "meetings";
  if (HELP_WORDS.includes(text)) return "help";
  return "unknown";
}

function parseAction(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return { action: "UNKNOWN" };

  // Confirmation token id: "CONFIRM_PROPOSE_TIMES:<token>" (token is not numeric)
  if (raw.startsWith(`${ID.CONFIRM_PROPOSE_TIMES}:`)) {
    const token = raw.slice(ID.CONFIRM_PROPOSE_TIMES.length + 1);
    return token ? { action: "CONFIRM_PROPOSE_TIMES", token } : { action: "UNKNOWN" };
  }

  // Parametrised interactive ids: "REQUEST_DETAILS:123"
  const m = raw.match(/^([A-Z_]+):(\d+)$/);
  if (m) {
    const requestId = Number(m[2]);
    if (m[1] === ID.REQUEST_DETAILS) return { action: "REQUEST_DETAILS", requestId };
    if (m[1] === ID.PROPOSE_TIMES) return { action: "PROPOSE_TIMES", requestId };
    if (m[1] === ID.MENTEE_DETAILS) return { action: "MENTEE_DETAILS", requestId };
    if (m[1] === ID.PROPOSE_TIMES_AI) return { action: "PROPOSE_TIMES_AI", requestId };
    if (m[1] === ID.RETRY_PROPOSE_TIMES) return { action: "RETRY_PROPOSE_TIMES", requestId };
    return { action: "UNKNOWN" };
  }

  // Bare interactive ids
  switch (raw) {
    case ID.CANCEL_PROPOSE_TIMES:
      return { action: "CANCEL_PROPOSE_TIMES" };
    case ID.MAIN_MENU:
      return { action: "MENU" };
    case ID.MORE_MENU:
      return { action: "MORE" };
    case ID.MENTOR_REQUESTS:
      return { action: "REQUESTS" };
    case ID.UPCOMING_MEETINGS:
      return { action: "MEETINGS" };
    case ID.HELP:
      return { action: "HELP" };
    case ID.MY_PROFILE:
      return { action: "PROFILE" };
    case ID.NEEDS_ATTENTION:
      return { action: "NEEDS_ATTENTION" };
    default:
      break;
  }

  // Typed text fallback
  const text = raw.toLowerCase();
  if (GREETING_WORDS.includes(text)) return { action: "MENU" };
  if (REQUESTS_WORDS.includes(text)) return { action: "REQUESTS" };
  if (MEETINGS_WORDS.includes(text)) return { action: "MEETINGS" };
  if (HELP_WORDS.includes(text)) return { action: "HELP" };
  if (MORE_WORDS.includes(text)) return { action: "MORE" };
  if (PROFILE_WORDS.includes(text)) return { action: "PROFILE" };
  return { action: "UNKNOWN" };
}

// ----------------------------------------------------------------------------
// Copy
// ----------------------------------------------------------------------------
function menuText(fullName) {
  return [`👑 היי ${fullName}!`, "מה תרצי לעשות?"].join("\n");
}

function helpText() {
  return [
    "עזרה 👑",
    "",
    "אפשר לכתוב או לבחור:",
    "• בקשות / 1 — בקשות שמחכות לך",
    "• פגישות / 2 — הפגישות הקרובות",
    "• תפריט — חזרה לתפריט הראשי",
  ].join("\n");
}

const UNKNOWN_TEXT = ["לא הצלחתי להבין 😅", "כתבי 'תפריט' כדי לראות את האפשרויות."].join("\n");

const UNKNOWN_NUMBER_TEXT = [
  "היי! 👑",
  "לא זיהיתי את המספר הזה במערכת Match Queens.",
  "אם את מנטורית ורוצה להשתמש בממשק ה-WhatsApp, שמרי את מספר הטלפון שלך בפרופיל באתר.",
].join("\n");

const NON_MENTOR_TEXT = "הממשק זמין כרגע למנטוריות בלבד";

const GENERIC_ERROR_TEXT = "אופס, משהו השתבש אצלנו 🙈 נסי שוב עוד רגע.";

// ----------------------------------------------------------------------------
// Formatting helpers
// ----------------------------------------------------------------------------
function menteeSummaryLine(mentee) {
  if (!mentee) return "";
  const left = mentee.jobTitle || mentee.workplace || "";
  const techs = Array.isArray(mentee.technologies)
    ? mentee.technologies.map((t) => t.name).filter(Boolean).slice(0, 3)
    : [];
  return [left, techs.join(", ")].filter(Boolean).join(" · ");
}

function proposeSlotsLink(requestId) {
  return `${APP_BASE_URL}/app/mentor-area/requests/${requestId}/propose-slots`;
}

// Text rendering of the pending list (with links) — used as the text-mode
// fallback body for the requests screen, and kept as a standalone export.
function formatPending(incomingRequests) {
  const list = Array.isArray(incomingRequests) ? incomingRequests : [];
  if (list.length === 0) return "אין לך בקשות שמחכות לתגובה כרגע 🌸";

  const shown = list.slice(0, MAX_LIST);
  const header =
    list.length === 1
      ? "📩 יש לך בקשה אחת שמחכה לתגובה:"
      : `📩 יש לך ${list.length} בקשות שמחכות לתגובה:`;

  const blocks = shown.map((r, i) => {
    const name = (r.mentee && r.mentee.fullName) || "מנטי";
    const summary = menteeSummaryLine(r.mentee);
    const lines = [`${i + 1}. ${name}`];
    if (summary) lines.push(`   ${summary}`);
    lines.push(`   להצעת זמנים: ${proposeSlotsLink(r.id)}`);
    return lines.join("\n");
  });

  const parts = [header, "", blocks.join("\n\n")];
  if (list.length > shown.length) parts.push("", `ועוד ${list.length - shown.length} בקשות.`);
  return parts.join("\n");
}

function hebrewWeekday(date) {
  return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long" }).format(date);
}
function hebrewDate(date) {
  return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric" }).format(date);
}
function timeRange(start, end) {
  const fmt = new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${fmt.format(start)}–${fmt.format(end)}`;
}

function upcomingMeetings(scheduledRequests, now = new Date()) {
  const list = Array.isArray(scheduledRequests) ? scheduledRequests : [];
  return list
    .map((r) => ({ request: r, meeting: r.meeting }))
    .filter(
      ({ meeting }) =>
        meeting &&
        meeting.status === "SCHEDULED" &&
        new Date(meeting.scheduledStart).getTime() > now.getTime()
    )
    .sort(
      (a, b) =>
        new Date(a.meeting.scheduledStart).getTime() - new Date(b.meeting.scheduledStart).getTime()
    );
}

function formatMeetings(scheduledRequests, now = new Date()) {
  const upcoming = upcomingMeetings(scheduledRequests, now);
  if (upcoming.length === 0) return "אין לך פגישות מתוזמנות כרגע";

  const render = ({ request, meeting }) => {
    const name = (request.mentee && request.mentee.fullName) || "מנטי";
    const start = new Date(meeting.scheduledStart);
    const end = new Date(meeting.scheduledEnd);
    return [`👤 ${name}`, `🗓 ${hebrewWeekday(start)} (${hebrewDate(start)})`, `🕐 ${timeRange(start, end)}`].join("\n");
  };

  const [first, ...rest] = upcoming;
  const parts = ["📅 הפגישה הקרובה שלך", "", render(first)];
  const more = rest.slice(0, MAX_LIST - 1);
  if (more.length > 0) parts.push("", "פגישות נוספות:", "", more.map(render).join("\n\n"));
  return parts.join("\n");
}

// ----------------------------------------------------------------------------
// Screens — each returns a provider-independent reply object.
// ----------------------------------------------------------------------------
function mainMenu(fullName) {
  return { text: menuText(fullName), buttons: [BTN.requests, BTN.meetings, BTN.more] };
}

function moreMenu() {
  return { text: "מה עוד? ✨", buttons: [BTN.profile, BTN.help, BTN.home] };
}

function helpScreen() {
  return { text: helpText(), buttons: [BTN.requests, BTN.meetings, BTN.home] };
}

function unknownScreen() {
  return { text: UNKNOWN_TEXT, buttons: [BTN.home] };
}

function staleRequestScreen() {
  return {
    text: "הבקשה הזו כבר לא ממתינה לתגובה שלך 🙏\nייתכן שהמנטי כבר בחרה זמן או שהבקשה נסגרה.",
    buttons: [BTN.requests, BTN.home],
  };
}

function requestsScreen(incomingRequests) {
  const list = Array.isArray(incomingRequests) ? incomingRequests : [];
  if (list.length === 0) {
    return { text: "אין לך בקשות שמחכות לתגובה כרגע 🌸", buttons: [BTN.home] };
  }

  const shown = list.slice(0, MAX_REQUEST_ROWS);
  const header =
    list.length === 1
      ? "📩 יש לך בקשה אחת שמחכה לתגובה."
      : `📩 יש לך ${list.length} בקשות שמחכות לתגובה.`;
  const note = list.length > shown.length ? `\n(מוצגות ${shown.length} הראשונות)` : "";

  const rows = shown.map((r) => ({
    id: `${ID.REQUEST_DETAILS}:${r.id}`,
    title: (r.mentee && r.mentee.fullName) || "מנטי",
    description: menteeSummaryLine(r.mentee) || "בקשת מנטורינג",
  }));

  return {
    text: header + note,
    list: { button: "בחרי בקשה", sections: [{ title: "בקשות ממתינות", rows }] },
    // Text-mode users get the full compact list WITH the propose-slots links.
    fallbackText: formatPending(list),
  };
}

function requestDetailsScreen(req, { proposeFocus = false } = {}) {
  const m = req.mentee || {};
  const name = m.fullName || "המנטי";
  const summary = menteeSummaryLine(m);
  const link = proposeSlotsLink(req.id);

  const lines = [`👤 ${name}`];
  if (summary) lines.push(summary);
  if (m.yearsOfExperience != null) lines.push(`ניסיון: ${m.yearsOfExperience} שנים`);
  lines.push(
    "",
    "🗓 להציע זמנים:",
    "• כאן בוואטסאפ — לחצי על הכפתור וכתבי מתי את פנויה",
    `• או באתר: ${link}`
  );
  if (proposeFocus) lines.unshift("הציעי זמנים 👇", "");

  return {
    text: lines.join("\n"),
    buttons: [
      { id: `${ID.PROPOSE_TIMES_AI}:${req.id}`, title: "✍️ להציע כאן" },
      BTN.backToRequests,
      BTN.home,
    ],
  };
}

function menteeDetailsScreen(req, { fromRequests = false } = {}) {
  const m = req.mentee || {};
  const lines = [`👤 ${m.fullName || "המנטי"}`];
  const summary = menteeSummaryLine(m);
  if (summary) lines.push(summary);
  if (m.yearsOfExperience != null) lines.push(`ניסיון: ${m.yearsOfExperience} שנים`);
  return { text: lines.join("\n"), buttons: fromRequests ? [BTN.backToRequests, BTN.home] : [BTN.home] };
}

// Local calendar date "YYYY-MM-DD" for a Date, in the configured timezone.
function localDateKey(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Narrow an already-sorted upcoming list by a small, safe time-range enum.
// null / "ALL_UPCOMING" -> unchanged. "THIS_WEEK" == the next 7 days.
function filterUpcomingByRange(upcoming, range, now = new Date()) {
  if (!range || range === "ALL_UPCOMING") return upcoming;
  if (range === "NEXT_MEETING") return upcoming.slice(0, 1);

  if (range === "TODAY" || range === "TOMORROW") {
    const ref = new Date(now.getTime() + (range === "TOMORROW" ? 24 * 3600 * 1000 : 0));
    const key = localDateKey(ref);
    return upcoming.filter((u) => localDateKey(new Date(u.meeting.scheduledStart)) === key);
  }
  if (range === "THIS_WEEK") {
    const end = now.getTime() + 7 * 24 * 3600 * 1000;
    return upcoming.filter((u) => new Date(u.meeting.scheduledStart).getTime() <= end);
  }
  return upcoming;
}

const RANGE_LABEL = {
  TODAY: "היום",
  TOMORROW: "מחר",
  THIS_WEEK: "בשבוע הקרוב",
  NEXT_MEETING: "",
  ALL_UPCOMING: "",
};

function meetingsScreen(scheduledRequests, timeRange = null) {
  const allUpcoming = upcomingMeetings(scheduledRequests);
  const upcoming = filterUpcomingByRange(allUpcoming, timeRange);

  if (upcoming.length === 0) {
    const label = RANGE_LABEL[timeRange] ? ` ${RANGE_LABEL[timeRange]}` : " כרגע";
    return { text: `אין לך פגישות מתוזמנות${label} 🌸`, buttons: [BTN.home] };
  }

  // Reuse the same renderer; when a range narrowed the list, format that subset.
  const scoped = timeRange && timeRange !== "ALL_UPCOMING"
    ? upcoming.map((u) => u.request)
    : scheduledRequests;
  const first = upcoming[0];
  return {
    text: formatMeetings(scoped),
    buttons: [{ id: `${ID.MENTEE_DETAILS}:${first.request.id}`, title: "👤 פרטי המנטית" }, BTN.home],
  };
}

function profileScreen(fullName, counts) {
  const c = counts || {};
  return {
    text: [
      `👤 ${fullName}`,
      "",
      `📩 בקשות שמחכות: ${c.waitingForResponse ?? 0}`,
      `📅 פגישות מתוזמנות: ${c.scheduledMeetings ?? 0}`,
    ].join("\n"),
    buttons: [BTN.requests, BTN.meetings, BTN.home],
  };
}

// "What needs my attention?" — a deterministic summary of the REAL current
// state (counts + the closest meeting). No AI phrasing, no invented facts.
function needsAttentionScreen(dashboard) {
  const c = (dashboard && dashboard.counts) || {};
  const upcoming = upcomingMeetings((dashboard && dashboard.scheduledRequests) || []);
  const lines = [
    "🗒️ מה דורש טיפול:",
    "",
    `📩 בקשות שמחכות לך: ${c.waitingForResponse ?? 0}`,
    `⏳ ממתינות לבחירת המנטי: ${c.awaitingMenteeSelection ?? 0}`,
  ];
  if (upcoming.length > 0) {
    const { request, meeting } = upcoming[0];
    const start = new Date(meeting.scheduledStart);
    lines.push(
      `📅 פגישה קרובה: ${(request.mentee && request.mentee.fullName) || "מנטי"} — ` +
        `${hebrewWeekday(start)} ${timeRange(start, new Date(meeting.scheduledEnd))}`
    );
  } else {
    lines.push("📅 אין פגישה קרובה");
  }
  return { text: lines.join("\n"), buttons: [BTN.requests, BTN.meetings, BTN.home] };
}

// AI could not be mapped confidently -> offer the existing menu.
function notUnderstoodMenu(fullName) {
  return {
    text: `לא בטוחה שהבנתי למה התכוונת 👑\nרוצה לבחור מכאן?`,
    buttons: [BTN.requests, BTN.meetings, BTN.more],
  };
}

// AI extracted a mentee name, but no pending request matches it.
function noRequestForNameScreen(name, incomingRequests) {
  const base = { text: `לא מצאתי בקשה פתוחה מ״${name}״ 🤔` };
  const list = requestsScreen(incomingRequests);
  if (list.list) return { ...list, text: `${base.text}\n\n${list.text}` };
  return { text: `${base.text}\n\n${list.text}`, buttons: list.buttons };
}

// AI extracted a name that matches more than one pending request.
function ambiguousNameScreen(name, matches) {
  const rows = matches.slice(0, MAX_REQUEST_ROWS).map((r) => ({
    id: `${ID.REQUEST_DETAILS}:${r.id}`,
    title: (r.mentee && r.mentee.fullName) || "מנטי",
    description: menteeSummaryLine(r.mentee) || "בקשת מנטורינג",
  }));
  return {
    text: `יש כמה בקשות שמתאימות ל״${name}״ — לאיזו התכוונת?`,
    list: { button: "בחרי בקשה", sections: [{ title: "בקשות מתאימות", rows }] },
    fallbackText:
      `יש כמה בקשות שמתאימות ל״${name}״:\n` +
      matches.map((r, i) => `${i + 1}. ${(r.mentee && r.mentee.fullName) || "מנטי"}`).join("\n"),
  };
}

// Normalize a person name for loose comparison (trim, collapse spaces, lower).
function normName(s) {
  return String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase();
}

// Match extracted name against a mentor's pending requests. Returns all matches:
// full-name contains the query, or the query contains any name token.
function matchRequestsByMenteeName(incomingRequests, rawName) {
  const q = normName(rawName);
  if (!q) return [];
  const list = Array.isArray(incomingRequests) ? incomingRequests : [];
  return list.filter((r) => {
    const full = normName(r.mentee && r.mentee.fullName);
    if (!full) return false;
    if (full === q || full.includes(q) || q.includes(full)) return true;
    return full.split(" ").some((tok) => tok && (tok === q || q.includes(tok)));
  });
}

// ----------------------------------------------------------------------------
// Identity resolution
// ----------------------------------------------------------------------------
async function resolveSender(from) {
  const e164 = extractWhatsAppNumber(from);
  if (!e164) return { kind: "unknownNumber" };

  const user = await prisma.user.findUnique({
    where: { whatsappPhone: e164 },
    select: { id: true, fullName: true, mentorProfile: { select: { id: true } } },
  });

  if (!user) return { kind: "unknownNumber" };
  if (!user.mentorProfile) return { kind: "notMentor", user };
  return { kind: "mentor", user, mentorProfileId: user.mentorProfile.id };
}

// ----------------------------------------------------------------------------
// runIntent — the SINGLE dispatch. Buttons, typed commands and the AI path all
// funnel through here, so there is exactly one implementation per action.
// `intent` = { action, requestId?, timeRange? } using the INTERNAL action names
// (MENU / MORE / HELP / REQUESTS / MEETINGS / PROFILE / NEEDS_ATTENTION /
//  REQUEST_DETAILS / PROPOSE_TIMES / MENTEE_DETAILS / UNKNOWN).
// `ctx` = { user, mentorProfileId }. `dashboard` may be passed in to avoid a
// second getMentorDashboard read on the AI propose-times path.
// ----------------------------------------------------------------------------
async function runIntent(intent, ctx, dashboard = null) {
  const { action, requestId, timeRange } = intent || {};
  const { user, mentorProfileId } = ctx;

  if (action === "MENU") return mainMenu(user.fullName);
  if (action === "MORE") return moreMenu();
  if (action === "HELP") return helpScreen();
  if (action === "UNKNOWN" || !action) return unknownScreen();

  const dash = dashboard || (await requestService.getMentorDashboard(mentorProfileId));

  if (action === "REQUESTS") return requestsScreen(dash.incomingRequests);
  if (action === "MEETINGS") return meetingsScreen(dash.scheduledRequests, timeRange || null);
  if (action === "PROFILE") return profileScreen(user.fullName, dash.counts);
  if (action === "NEEDS_ATTENTION") return needsAttentionScreen(dash);

  // Parametrised — ALWAYS re-validate ownership + current state against the
  // freshly-read, mentor-scoped dashboard.
  if (action === "REQUEST_DETAILS" || action === "PROPOSE_TIMES") {
    const req = (dash.incomingRequests || []).find((r) => r.id === requestId);
    if (!req) return staleRequestScreen();
    return requestDetailsScreen(req, { proposeFocus: action === "PROPOSE_TIMES" });
  }

  if (action === "MENTEE_DETAILS") {
    const pending = (dash.incomingRequests || []).find((r) => r.id === requestId);
    if (pending) return menteeDetailsScreen(pending, { fromRequests: true });
    const scheduled = (dash.scheduledRequests || []).find((r) => r.id === requestId);
    if (scheduled) return menteeDetailsScreen(scheduled);
    return staleRequestScreen();
  }

  return unknownScreen();
}

// ----------------------------------------------------------------------------
// AI path — ONLY reached when the deterministic parser returned UNKNOWN.
// Gemini classifies -> we validate (allow-list + threshold + entities) -> we
// map to an EXISTING internal intent and run it through runIntent(). Any doubt
// -> notUnderstoodMenu(). Gemini never touches the DB or decides authorization.
// ----------------------------------------------------------------------------
async function runAiPath(body, ctx) {
  let ai;
  try {
    ai = await gemini.classifyIntent(String(body || ""), AI_ACTIONS);
  } catch (err) {
    // classifyIntent is designed never to throw; this is pure belt-and-braces.
    // eslint-disable-next-line no-console
    console.warn("[whatsapp][ai] classifier threw unexpectedly:", err && err.message);
    return notUnderstoodMenu(ctx.user.fullName);
  }

  const confident =
    ai &&
    ai.ok &&
    typeof ai.action === "string" &&
    AI_ACTIONS.includes(ai.action) &&
    Number(ai.confidence) >= AI_CONFIDENCE_THRESHOLD;

  if (!confident) {
    // eslint-disable-next-line no-console
    console.log(
      `[whatsapp][ai] no confident mapping (action=${ai && ai.action}, ` +
        `confidence=${ai && ai.confidence}, ok=${ai && ai.ok}, reason=${ai && ai.reason || "-"}) -> menu`
    );
    return notUnderstoodMenu(ctx.user.fullName);
  }

  const wire = ai.action;
  const entities = ai.entities || {};

  // Name-carrying actions: the BACKEND resolves the request id, never the model.
  if (AI_ACTIONS_REQUIRING_NAME.includes(wire)) {
    const name = (entities.menteeName || "").trim();
    const dash = await requestService.getMentorDashboard(ctx.mentorProfileId);
    if (!name) return { ...requestsScreen(dash.incomingRequests) }; // missing entity -> pick from list
    const matches = matchRequestsByMenteeName(dash.incomingRequests, name);
    if (matches.length === 0) return noRequestForNameScreen(name, dash.incomingRequests);
    if (matches.length > 1) return ambiguousNameScreen(name, matches);
    // "I want to propose times for Maya" -> go straight into availability capture.
    if (wire === ID.PROPOSE_TIMES) return startAvailabilityFlow(matches[0].id, ctx, dash);
    return runIntent({ action: "REQUEST_DETAILS", requestId: matches[0].id }, ctx, dash);
  }

  // Everything else: reuse the deterministic parser to turn the wire id into an
  // internal intent, attaching a validated timeRange for the meetings action.
  const intent = parseAction(wire);
  if (wire === ID.UPCOMING_MEETINGS && entities.timeRange) intent.timeRange = entities.timeRange;
  // eslint-disable-next-line no-console
  console.log(`[whatsapp][ai] "${String(body).slice(0, 60)}" -> ${wire} (${ai.confidence})`);
  return runIntent(intent, ctx);
}

// ----------------------------------------------------------------------------
// AI "propose times from WhatsApp" — multi-step. Gemini only extracts the
// availability; ALL scheduling authority stays in schedulingService.
// State between steps lives in whatsappPendingStore (keyed by mentor user id).
// ----------------------------------------------------------------------------

// Re-check that `requestId` is a real, still-pending request owned by this
// mentor. Returns the incomingRequests row or null. `dash` may be reused.
async function loadOwnedPendingRequest(requestId, ctx, dash = null) {
  const d = dash || (await requestService.getMentorDashboard(ctx.mentorProfileId));
  const req = (d.incomingRequests || []).find((r) => r.id === Number(requestId));
  return req ? { req, dash: d } : { req: null, dash: d };
}

function availabilityPromptScreen(menteeName) {
  return {
    text:
      `כתבי לי בערך מתי את פנויה לפגישה עם ${menteeName || "המנטי"} 👑\n` +
      `לדוגמה: "ראשון אחרי 17, שלישי בין 10 ל-13"`,
    buttons: [BTN.cancelProposeTimes, BTN.home],
  };
}

function availabilityUnclearScreen(requestId) {
  return {
    text:
      "לא הצלחתי להבין מספיק טוב את הזמנים שכתבת 👑\n" +
      'נסי למשל: "ראשון אחרי 17, שלישי בין 10 ל-13"',
    buttons: [{ id: `${ID.RETRY_PROPOSE_TIMES}:${requestId}`, title: "🔄 נסי שוב" }, BTN.home],
  };
}

function requestChangedScreen() {
  return {
    text:
      "הבקשה השתנתה מאז שהצעת את הזמנים 👑\n" +
      "פתחי את הבקשה מחדש כדי לראות את המצב העדכני.",
    buttons: [BTN.requests, BTN.home],
  };
}

// Step 1: start capturing availability for a specific pending request.
async function startAvailabilityFlow(requestId, ctx, dash = null) {
  const { req } = await loadOwnedPendingRequest(requestId, ctx, dash);
  if (!req) {
    pendingStore.clear(ctx.user.id);
    return staleRequestScreen();
  }
  const menteeName = (req.mentee && req.mentee.fullName) || "המנטי";
  pendingStore.set(ctx.user.id, { kind: "AWAITING_AVAILABILITY", requestId: req.id, menteeName });
  return availabilityPromptScreen(menteeName);
}

// Step 2: the mentor's free-text availability message (routed here because a
// pending AWAITING_AVAILABILITY exists for her). Extract -> build slots ->
// preview. NO DB WRITE happens here.
async function handleAvailabilityText(body, pending, ctx) {
  const { req, dash } = await loadOwnedPendingRequest(pending.requestId, ctx);
  if (!req) {
    pendingStore.clear(ctx.user.id);
    return requestChangedScreen();
  }

  let extracted;
  try {
    extracted = await gemini.extractAvailability(String(body || ""));
  } catch (err) {
    // extractAvailability is designed never to throw; belt-and-braces.
    // eslint-disable-next-line no-console
    console.warn("[whatsapp][ai] extractAvailability threw unexpectedly:", err && err.message);
    return availabilityUnclearScreen(req.id);
  }
  const usable =
    extracted &&
    extracted.ok &&
    Array.isArray(extracted.availability) &&
    extracted.availability.length > 0 &&
    Number(extracted.confidence) >= AI_CONFIDENCE_THRESHOLD;

  if (!usable) {
    // eslint-disable-next-line no-console
    console.log(
      `[whatsapp][ai] availability not usable (ok=${extracted && extracted.ok}, ` +
        `n=${extracted && extracted.availability && extracted.availability.length}, ` +
        `confidence=${extracted && extracted.confidence}, reason=${extracted && extracted.reason || "-"})`
    );
    return availabilityUnclearScreen(req.id); // pending kept -> she can just retype
  }

  const mp = await prisma.mentorProfile.findUnique({
    where: { id: ctx.mentorProfileId },
    select: { meetingDurationMinutes: true },
  });
  const busy = await schedulingService.getMentorBusyIntervals(ctx.mentorProfileId);
  const { slots, reason } = avail.generateCandidateSlots(
    extracted.availability,
    mp && mp.meetingDurationMinutes,
    busy,
    new Date()
  );

  if (slots.length < avail.MIN_CANDIDATES) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp][ai] candidate generation -> ${reason} (${slots.length})`);
    return availabilityUnclearScreen(req.id);
  }

  const token = crypto.randomBytes(9).toString("base64url");
  pendingStore.set(ctx.user.id, {
    kind: "AWAITING_CONFIRMATION",
    requestId: req.id,
    menteeName: (req.mentee && req.mentee.fullName) || "המנטי",
    slots: slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
    token,
  });

  const lines = [
    `מצאתי ${slots.length} זמנים שמתאימים למה שכתבת 👑`,
    "",
    ...slots.map((s) => `• ${avail.formatSlotHebrew(s)}`),
    "",
    `רוצה לשלוח אותם ל${(req.mentee && req.mentee.fullName) || "מנטי"}?`,
  ];
  return {
    text: lines.join("\n"),
    buttons: [
      { id: `${ID.CONFIRM_PROPOSE_TIMES}:${token}`, title: "✅ שלחי זמנים" },
      { id: `${ID.RETRY_PROPOSE_TIMES}:${req.id}`, title: "🔄 נסי שוב" },
      BTN.cancelProposeTimes,
    ],
  };
}

// Step 3: the mentor tapped "✅ שלחי זמנים". Re-validate EVERYTHING, then hand
// the slots to the existing schedulingService.proposeSlots — its transaction /
// state machine is the final authority.
async function handleConfirmProposeTimes(token, ctx) {
  const pending = pendingStore.get(ctx.user.id);
  if (
    !pending ||
    pending.kind !== "AWAITING_CONFIRMATION" ||
    pending.token !== token ||
    !Array.isArray(pending.slots) ||
    pending.slots.length < avail.MIN_CANDIDATES
  ) {
    pendingStore.clear(ctx.user.id);
    return {
      text: "לא מצאתי הצעה פעילה לשליחה 🤔 אולי עבר יותר מדי זמן.\nפתחי את הבקשה מחדש כדי להציע זמנים.",
      buttons: [BTN.requests, BTN.home],
    };
  }

  const { req } = await loadOwnedPendingRequest(pending.requestId, ctx);
  if (!req) {
    pendingStore.clear(ctx.user.id);
    return requestChangedScreen();
  }

  try {
    await schedulingService.proposeSlots(pending.requestId, ctx.user.id, pending.slots);
  } catch (err) {
    pendingStore.clear(ctx.user.id);
    if (err && err.status === 409) return requestChangedScreen();
    // eslint-disable-next-line no-console
    console.error("[whatsapp][ai] proposeSlots failed:", err && (err.status || ""), err && err.message);
    return {
      text: "לא הצלחתי לשלוח את הזמנים כרגע 🙈 נסי שוב עוד רגע או דרך האתר.",
      buttons: [BTN.requests, BTN.home],
    };
  }

  pendingStore.clear(ctx.user.id);
  return {
    text:
      `שלחתי ל${pending.menteeName} ${pending.slots.length} זמנים לבחירה 🎉\n` +
      "נעדכן אותך כשהיא תבחר.",
    buttons: [BTN.meetings, BTN.home],
  };
}

// ----------------------------------------------------------------------------
// Entry point — called by routes/whatsapp.js. `body` is the typed text OR the
// tapped button/list id. Always resolves to a reply object with `.text`.
// ----------------------------------------------------------------------------
async function handleIncomingMessage({ from, body } = {}) {
  const sender = await resolveSender(from);
  if (sender.kind === "unknownNumber") return { text: UNKNOWN_NUMBER_TEXT };
  if (sender.kind === "notMentor") return { text: NON_MENTOR_TEXT };

  const ctx = { user: sender.user, mentorProfileId: sender.mentorProfileId };
  const parsed = parseAction(body);

  // 0. The AI propose-times flow buttons — always honoured, ownership/state
  //    re-checked inside each handler.
  if (parsed.action === "PROPOSE_TIMES_AI") return startAvailabilityFlow(parsed.requestId, ctx);
  if (parsed.action === "RETRY_PROPOSE_TIMES") return startAvailabilityFlow(parsed.requestId, ctx);
  if (parsed.action === "CONFIRM_PROPOSE_TIMES") return handleConfirmProposeTimes(parsed.token, ctx);
  if (parsed.action === "CANCEL_PROPOSE_TIMES") {
    pendingStore.clear(ctx.user.id);
    return { text: "בוטל 👍", buttons: [BTN.requests, BTN.meetings, BTN.home] };
  }

  // 1. Any other recognised command / button — this ABANDONS a half-finished
  //    availability flow (the mentor changed her mind).
  if (parsed.action !== "UNKNOWN") {
    pendingStore.clear(ctx.user.id);
    return runIntent(parsed, ctx);
  }

  // 2. Free text while we are waiting for her availability -> treat it as that.
  const pending = pendingStore.get(ctx.user.id);
  if (pending && pending.kind === "AWAITING_AVAILABILITY") {
    return handleAvailabilityText(body, pending, ctx);
  }

  // 3. Otherwise: ordinary natural-language intent classification.
  return runAiPath(body, ctx);
}

module.exports = {
  handleIncomingMessage,
  runIntent,
  runAiPath,
  startAvailabilityFlow,
  handleAvailabilityText,
  handleConfirmProposeTimes,
  resolveSender,
  parseIntent,
  parseAction,
  // formatting / screens (exported for verification & reuse)
  formatPending,
  formatMeetings,
  upcomingMeetings,
  filterUpcomingByRange,
  matchRequestsByMenteeName,
  menteeSummaryLine,
  mainMenu,
  moreMenu,
  helpScreen,
  requestsScreen,
  requestDetailsScreen,
  meetingsScreen,
  profileScreen,
  needsAttentionScreen,
  notUnderstoodMenu,
  noRequestForNameScreen,
  ambiguousNameScreen,
  unknownScreen,
  staleRequestScreen,
  menuText,
  helpText,
  ID,
  BTN,
  AI_ACTIONS,
  AI_CONFIDENCE_THRESHOLD,
  MAX_LIST,
  TZ,
  APP_BASE_URL,
  UNKNOWN_TEXT,
  UNKNOWN_NUMBER_TEXT,
  NON_MENTOR_TEXT,
  GENERIC_ERROR_TEXT,
};
