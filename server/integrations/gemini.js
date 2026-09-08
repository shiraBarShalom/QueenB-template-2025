// ============================================================================
// Gemini intent classifier — the ONLY place that talks to the Gemini API.
// ============================================================================
// Responsibility: turn ONE free-text WhatsApp message from a mentor into a
// structured, already-validated intent:
//
//     { action, confidence, entities: { menteeName, timeRange }, ok, reason }
//
// It is NOT an agent. It never touches Prisma, never decides authorization,
// never invents application data, never answers the user. whatsappService owns
// the allowed-action list and the confidence threshold and does the real work.
//
// HARD GUARANTEES
//   * classifyIntent() NEVER throws and ALWAYS resolves to the shape above.
//   * On missing key / HTTP error / timeout / non-JSON / bad shape / disallowed
//     action -> { action: "UNKNOWN", confidence: 0, ok: false, reason }.
//   * Only runs on the async path (after the webhook 200 ACK) — see
//     routes/whatsapp.js.
//
// Transport: plain REST via global fetch (Node 18+), no SDK dependency, same
// style as integrations/whatsapp360.js.
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
//   header  x-goog-api-key: <GEMINI_API_KEY>
//   generationConfig.responseMimeType = "application/json" + responseSchema
// ============================================================================

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_INPUT_CHARS = 1000;

const TIME_RANGES = ["TODAY", "TOMORROW", "THIS_WEEK", "NEXT_MEETING", "ALL_UPCOMING"];

function model() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}
function timeoutMs() {
  const n = Number(process.env.GEMINI_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}
function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// System prompt. Intent classification only — no answering, no data invention.
const SYSTEM_PROMPT = [
  "You are an intent classifier for the Match Queens mentor WhatsApp assistant.",
  "The user is a MENTOR writing mostly in Hebrew (sometimes English).",
  "Map her message to EXACTLY ONE action from the allowed list, or UNKNOWN.",
  "",
  "Action meanings:",
  "- MENTOR_REQUESTS: mentoring requests waiting for HER response / who is waiting for her / what she needs to reply to.",
  "- UPCOMING_MEETINGS: her scheduled meeting(s) — when / with whom / what is on her calendar.",
  "- PROPOSE_TIMES: she wants to offer or propose meeting times to a SPECIFIC named mentee.",
  "- REQUEST_DETAILS: she wants details about a SPECIFIC named mentee's request.",
  "- NEEDS_ATTENTION: she asks broadly what needs her attention / what she has to handle, WITHOUT naming a person and without clearly meaning only requests or only meetings.",
  "- MY_PROFILE: her own profile / stats.",
  "- HELP: help / how this works.",
  "- MAIN_MENU: go back to the menu / start over.",
  "- UNKNOWN: anything else — small talk, life advice, opinions, questions unrelated to these actions.",
  "",
  "Rules:",
  "- NEVER answer the user. NEVER invent names, dates, numbers, requests or data.",
  "- entities.menteeName: set ONLY if the user explicitly names a person; otherwise null.",
  "- entities.timeRange: set ONLY for UPCOMING_MEETINGS, one of TODAY, TOMORROW, THIS_WEEK, NEXT_MEETING, ALL_UPCOMING",
  "  (מחר->TOMORROW, היום->TODAY, השבוע->THIS_WEEK, הקרובה/הבאה->NEXT_MEETING). If unclear, null.",
  "- confidence: your 0..1 certainty the chosen action is correct. Be conservative; when unsure, lower it or use UNKNOWN.",
  "- Output ONLY the JSON object. No markdown, no commentary.",
].join("\n");

// Shared low-level call. Throws on any failure. Returns the parsed model JSON.
// `responseSchema` constrains the output; `systemPrompt` sets the task.
async function generateJson(systemPrompt, message, responseSchema) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "NO_KEY";
    throw err;
  }
  if (typeof fetch !== "function") throw new Error("global fetch is unavailable (Node 18+ required)");

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: String(message || "").slice(0, MAX_INPUT_CHARS) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
  });

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}`);
    err.status = res.status;
    err.responseBody = raw.slice(0, 400);
    throw err;
  }

  const data = JSON.parse(raw); // throws -> caught by the public fn
  const parts =
    data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = parts && parts[0] && parts[0].text;
  if (!text || typeof text !== "string") throw new Error("Gemini response had no text part");
  return JSON.parse(text); // throws -> caught by the public fn
}

// --- intent classification transport ---
function intentSchema(allowedActions) {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: [...allowedActions, "UNKNOWN"] },
      confidence: { type: "number" },
      menteeName: { type: "string" },
      timeRange: { type: "string" },
    },
    required: ["action", "confidence"],
  };
}
function callGemini(message, allowedActions) {
  return generateJson(SYSTEM_PROMPT, message, intentSchema(allowedActions));
}

// Coerce whatever the model returned into the strict internal shape.
function normalize(obj, allowedActions) {
  const o = obj && typeof obj === "object" ? obj : {};

  let action = typeof o.action === "string" ? o.action.trim().toUpperCase() : "UNKNOWN";
  if (action !== "UNKNOWN" && !allowedActions.includes(action)) action = "UNKNOWN";

  let confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  // entities may come flat (o.menteeName) or nested (o.entities.menteeName)
  const ent = o.entities && typeof o.entities === "object" ? o.entities : o;

  const menteeName =
    typeof ent.menteeName === "string" && ent.menteeName.trim()
      ? ent.menteeName.trim().slice(0, 80)
      : null;

  let timeRange = typeof ent.timeRange === "string" ? ent.timeRange.trim().toUpperCase() : null;
  if (!TIME_RANGES.includes(timeRange)) timeRange = null;

  // If the model collapsed to UNKNOWN, drop any entities it may have hallucinated.
  if (action === "UNKNOWN") return { action, confidence, entities: {} };
  return { action, confidence, entities: { menteeName, timeRange } };
}

// Public API. Never throws. `transport` is an injection seam for tests only.
async function classifyIntent(message, allowedActions, { transport } = {}) {
  const list = Array.isArray(allowedActions) ? allowedActions : [];
  if (!transport && !isConfigured()) {
    return { action: "UNKNOWN", confidence: 0, entities: {}, ok: false, reason: "not-configured" };
  }
  const fn = transport || callGemini;
  try {
    const rawObj = await fn(message, list);
    return { ...normalize(rawObj, list), ok: true };
  } catch (err) {
    const reason = err && (err.code || (err.status ? `http-${err.status}` : err.name)) || "error";
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp][gemini] classification failed (${reason}): ${err && err.message}`);
    return { action: "UNKNOWN", confidence: 0, entities: {}, ok: false, reason };
  }
}

// ============================================================================
// Availability extraction — second thin structured-extraction function.
// ============================================================================
// Turns ONE free-text Hebrew availability message from a mentor into a list of
// { day, startTime, endTime, daypart }. It does NOT schedule, does NOT pick the
// final slots, does NOT invent dates. The BACKEND (services/whatsappAvailability)
// owns daypart -> clock-time defaults, future-only checks, conflict checks and
// the call to schedulingService.proposeSlots.

const AVAIL_DAYS = [
  "TODAY",
  "TOMORROW",
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const AVAIL_DAYPARTS = ["MORNING", "NOON", "AFTERNOON", "EVENING"];

const AVAILABILITY_PROMPT = [
  "You extract a mentor's stated availability from ONE Hebrew (sometimes English) message.",
  "Return ONLY JSON. Do NOT schedule anything, do NOT choose specific slots, do NOT invent days or times.",
  "",
  "For every distinct time window the mentor mentions, output one item with:",
  "- day: one of TODAY, TOMORROW, SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY",
  "  (ראשון=SUNDAY, שני=MONDAY, שלישי=TUESDAY, רביעי=WEDNESDAY, חמישי=THURSDAY, שישי=FRIDAY, שבת=SATURDAY, היום=TODAY, מחר=TOMORROW).",
  "- startTime / endTime: 24h 'HH:MM' when the mentor gave clock times, else empty string \"\".",
  "  'אחרי 17' -> startTime '17:00', endTime ''.   'לפני 15' -> startTime '', endTime '15:00'.",
  "  'בין 10 ל-13' -> startTime '10:00', endTime '13:00'.   'ב-18:30' -> startTime '18:30', endTime '18:30'.",
  "- daypart: one of MORNING, NOON, AFTERNOON, EVENING when she used a vague part-of-day",
  "  (בוקר=MORNING, צהריים=NOON, אחהצ/אחר הצהריים=AFTERNOON, ערב=EVENING), else empty string \"\".",
  "  If she gave clock times, leave daypart \"\".",
  "",
  "confidence: 0..1 that you correctly captured her availability. If the message is not about availability,",
  "or is too vague to place on any day, return availability: [] and a low confidence.",
].join("\n");

const AVAILABILITY_SCHEMA = {
  type: "object",
  properties: {
    availability: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string", enum: AVAIL_DAYS },
          startTime: { type: "string" },
          endTime: { type: "string" },
          daypart: { type: "string" },
        },
        required: ["day"],
      },
    },
    confidence: { type: "number" },
  },
  required: ["availability", "confidence"],
};

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// Coerce the model output to a strict shape. Drops anything that is not valid.
function normalizeAvailability(obj) {
  const o = obj && typeof obj === "object" ? obj : {};

  let confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  const rawList = Array.isArray(o.availability) ? o.availability : [];
  const availability = [];
  for (const entry of rawList.slice(0, 10)) {
    if (!entry || typeof entry !== "object") continue;
    const day = typeof entry.day === "string" ? entry.day.trim().toUpperCase() : "";
    if (!AVAIL_DAYS.includes(day)) continue;

    const startTime = typeof entry.startTime === "string" && HHMM.test(entry.startTime.trim()) ? entry.startTime.trim() : null;
    const endTime = typeof entry.endTime === "string" && HHMM.test(entry.endTime.trim()) ? entry.endTime.trim() : null;
    let daypart = typeof entry.daypart === "string" ? entry.daypart.trim().toUpperCase() : null;
    if (!AVAIL_DAYPARTS.includes(daypart)) daypart = null;

    // An entry is only useful if it says SOMETHING about the time window.
    if (!startTime && !endTime && !daypart) continue;
    availability.push({ day, startTime, endTime, daypart });
  }

  return { availability, confidence };
}

// Public API. Never throws. `transport` is an injection seam for tests only.
async function extractAvailability(message, { transport } = {}) {
  if (!transport && !isConfigured()) {
    return { availability: [], confidence: 0, ok: false, reason: "not-configured" };
  }
  const fn = transport || ((m) => generateJson(AVAILABILITY_PROMPT, m, AVAILABILITY_SCHEMA));
  try {
    const rawObj = await fn(message);
    return { ...normalizeAvailability(rawObj), ok: true };
  } catch (err) {
    const reason = (err && (err.code || (err.status ? `http-${err.status}` : err.name))) || "error";
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp][gemini] availability extraction failed (${reason}): ${err && err.message}`);
    return { availability: [], confidence: 0, ok: false, reason };
  }
}

module.exports = {
  classifyIntent,
  extractAvailability,
  isConfigured,
  normalize,
  normalizeAvailability,
  SYSTEM_PROMPT,
  AVAILABILITY_PROMPT,
  TIME_RANGES,
  AVAIL_DAYS,
  AVAIL_DAYPARTS,
  DEFAULT_MODEL,
  model,
};
