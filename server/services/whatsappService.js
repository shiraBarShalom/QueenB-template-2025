// ============================================================================
// WhatsApp Companion for mentors — the interface layer, NOT a business layer.
// ============================================================================
// WhatsApp is just another entry point into Match Queens. This module:
//   1. resolves the sender's phone number to a User -> MentorProfile,
//   2. parses a stateless text intent (greeting / 1 / 2 / help / unknown),
//   3. reads EXISTING data through requestService.getMentorDashboard, and
//   4. returns a plain-text reply string.
//
// HARD RULES (feature/whatsapp-mentor scope):
//   * READ-ONLY. This module never writes MentoringRequest.status / retryCount /
//     Meeting / SchedulingRound / OfferedSlot. The only "action" it offers is a
//     deep link to the EXISTING React propose-slots page, which drives the
//     verified schedulingService + state machine unchanged.
//   * No conversation state. Every message re-resolves identity and re-parses
//     intent. No table, no cache.
//   * Reuses requestService — no duplicate Prisma queries for dashboard data.
// ============================================================================

const prisma = require("../prismaClient");
const requestService = require("./requestService");
const { extractWhatsAppNumber } = require("../utils/phone");

// How many rows to spell out before collapsing the rest into "ועוד X".
const MAX_LIST = 3;

// Timezone for meeting times. Reuses the same setting the email templates use
// (server/.env → MAIL_TZ), defaulting to Israel time.
const TZ = process.env.MAIL_TZ || "Asia/Jerusalem";

// Base URL of the React app, for the propose-slots deep link. APP_BASE_URL is
// the WhatsApp/tunnel origin; fall back to CLIENT_ORIGIN, then localhost dev.
const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  process.env.CLIENT_ORIGIN ||
  "http://localhost:3000"
).replace(/\/+$/, "");

// ----------------------------------------------------------------------------
// Intent parsing — stateless, exact-ish text match.
// ----------------------------------------------------------------------------
const GREETING_WORDS = ["היי", "שלום", "hi", "hello", "hey", "menu", "תפריט"];
const PENDING_WORDS = ["1", "בקשות", "בקשות שמחכות לי"];
const MEETINGS_WORDS = ["2", "פגישות", "פגישות קרובות"];
const HELP_WORDS = ["3", "עזרה", "help"];

// "menu" | "pending" | "meetings" | "help" | "unknown"
function parseIntent(rawBody) {
  const text = String(rawBody == null ? "" : rawBody)
    .trim()
    .toLowerCase();
  if (!text) return "unknown";
  if (GREETING_WORDS.includes(text)) return "menu";
  if (PENDING_WORDS.includes(text)) return "pending";
  if (MEETINGS_WORDS.includes(text)) return "meetings";
  if (HELP_WORDS.includes(text)) return "help";
  return "unknown";
}

// ----------------------------------------------------------------------------
// Static copy
// ----------------------------------------------------------------------------
function menuText(fullName) {
  return [
    `👑 היי ${fullName}!`,
    "ברוכה הבאה ל-Match Queens",
    "",
    "מה תרצי לעשות?",
    "",
    "1. בקשות שמחכות לי",
    "2. פגישות קרובות",
    "3. עזרה",
  ].join("\n");
}

function helpText() {
  return [
    "עזרה 👑",
    "",
    "כתבי מספר או מילה:",
    "1 · בקשות שמחכות לי",
    "2 · פגישות קרובות",
    "3 · עזרה",
    "",
    'כתבי "תפריט" כדי לחזור לתפריט הראשי.',
  ].join("\n");
}

const UNKNOWN_TEXT = ["לא הצלחתי להבין 😅", "כתבי 'תפריט' כדי לראות את האפשרויות."].join("\n");

const UNKNOWN_NUMBER_TEXT = [
  "היי! 👑",
  "לא זיהיתי את המספר הזה במערכת Match Queens.",
  "אם את מנטורית ורוצה להשתמש בממשק ה-WhatsApp, פני לצוות כדי לחבר את המספר שלך.",
].join("\n");

// Exact wording requested by the spec.
const NON_MENTOR_TEXT = "הממשק זמין כרגע למנטוריות בלבד";

const GENERIC_ERROR_TEXT = "אופס, משהו השתבש אצלנו 🙈 נסי שוב עוד רגע.";

// ----------------------------------------------------------------------------
// Formatting helpers for real data
// ----------------------------------------------------------------------------

// "Backend Engineer · Node.js, React" — job title (or workplace) plus up to
// three technologies. Either part may be missing.
function menteeSummaryLine(mentee) {
  if (!mentee) return "";
  const left = mentee.jobTitle || mentee.workplace || "";
  const techs = Array.isArray(mentee.technologies)
    ? mentee.technologies.map((t) => t.name).filter(Boolean).slice(0, 3)
    : [];
  const right = techs.join(", ");
  return [left, right].filter(Boolean).join(" · ");
}

function proposeSlotsLink(requestId) {
  return `${APP_BASE_URL}/app/mentor-area/requests/${requestId}/propose-slots`;
}

function formatPending(incomingRequests) {
  const list = Array.isArray(incomingRequests) ? incomingRequests : [];
  if (list.length === 0) {
    return "אין לך בקשות שמחכות לתגובה כרגע 🌸";
  }

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
    // Every incomingRequest is WAITING_FOR_MENTOR_SLOTS by definition, so the
    // propose-times link is always relevant. Slot selection stays on the web.
    lines.push(`   להצעת זמנים: ${proposeSlotsLink(r.id)}`);
    return lines.join("\n");
  });

  const parts = [header, "", blocks.join("\n\n")];
  if (list.length > shown.length) {
    parts.push("", `ועוד ${list.length - shown.length} בקשות.`);
  }
  return parts.join("\n");
}

function hebrewWeekday(date) {
  return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long" }).format(date);
}
function hebrewDate(date) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    day: "numeric",
    month: "numeric",
  }).format(date);
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

// scheduledRequests -> only rows with a live, future meeting, soonest first.
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
        new Date(a.meeting.scheduledStart).getTime() -
        new Date(b.meeting.scheduledStart).getTime()
    );
}

function formatMeetings(scheduledRequests, now = new Date()) {
  const upcoming = upcomingMeetings(scheduledRequests, now);
  if (upcoming.length === 0) {
    return "אין לך פגישות מתוזמנות כרגע";
  }

  const render = ({ request, meeting }) => {
    const name = (request.mentee && request.mentee.fullName) || "מנטי";
    const start = new Date(meeting.scheduledStart);
    const end = new Date(meeting.scheduledEnd);
    return [
      name,
      `${hebrewWeekday(start)} (${hebrewDate(start)})`,
      timeRange(start, end),
    ].join("\n");
  };

  const [first, ...rest] = upcoming;
  const parts = ["📅 הפגישה הקרובה שלך:", "", render(first)];

  const more = rest.slice(0, MAX_LIST - 1);
  if (more.length > 0) {
    parts.push("", "פגישות נוספות:", "", more.map(render).join("\n\n"));
  }
  return parts.join("\n");
}

// ----------------------------------------------------------------------------
// Identity resolution
// ----------------------------------------------------------------------------
// Returns one of:
//   { kind: "unknownNumber" }
//   { kind: "notMentor", user }
//   { kind: "mentor", user, mentorProfileId }
async function resolveSender(from) {
  const e164 = extractWhatsAppNumber(from);
  if (!e164) return { kind: "unknownNumber" };

  const user = await prisma.user.findUnique({
    where: { whatsappPhone: e164 },
    select: {
      id: true,
      fullName: true,
      mentorProfile: { select: { id: true } },
    },
  });

  if (!user) return { kind: "unknownNumber" };
  if (!user.mentorProfile) return { kind: "notMentor", user };
  return { kind: "mentor", user, mentorProfileId: user.mentorProfile.id };
}

// ----------------------------------------------------------------------------
// Entry point — called by routes/whatsapp.js
// ----------------------------------------------------------------------------
// Always resolves to { text: string }. Never throws for expected cases; the
// route wraps it in one more try/catch as a backstop.
async function handleIncomingMessage({ from, body } = {}) {
  const sender = await resolveSender(from);

  if (sender.kind === "unknownNumber") return { text: UNKNOWN_NUMBER_TEXT };
  if (sender.kind === "notMentor") return { text: NON_MENTOR_TEXT };

  const { user, mentorProfileId } = sender;
  const intent = parseIntent(body);

  if (intent === "menu") return { text: menuText(user.fullName) };
  if (intent === "help") return { text: helpText() };
  if (intent === "unknown") return { text: UNKNOWN_TEXT };

  // "pending" or "meetings" — one read of the existing dashboard projection.
  const dashboard = await requestService.getMentorDashboard(mentorProfileId);

  if (intent === "pending") {
    return { text: formatPending(dashboard.incomingRequests) };
  }
  // intent === "meetings"
  return { text: formatMeetings(dashboard.scheduledRequests) };
}

module.exports = {
  handleIncomingMessage,
  resolveSender,
  parseIntent,
  // exported for verification / reuse
  formatPending,
  formatMeetings,
  upcomingMeetings,
  menuText,
  helpText,
  MAX_LIST,
  TZ,
  APP_BASE_URL,
  UNKNOWN_TEXT,
  UNKNOWN_NUMBER_TEXT,
  NON_MENTOR_TEXT,
  GENERIC_ERROR_TEXT,
};
