// ============================================================================
// WhatsApp availability -> candidate slots (feature/whatsapp-mentor).
// ============================================================================
// PURE, deterministic helpers. Given the structured availability that Gemini
// extracted (list of { day, startTime, endTime, daypart }), this module turns
// it into 2-3 concrete { startTime, endTime } ISO candidate slots:
//   * daypart -> clock times via the DAYPART constants below (NOT hidden in a
//     prompt — they live here, in the backend)
//   * open-ended windows ("after 17") get a bounded default window
//   * each candidate is a meeting-duration block, future-only (+ buffer), and
//     not overlapping the mentor's existing busy intervals
//
// It NEVER writes to the DB and NEVER calls schedulingService. whatsappService
// pre-validates with these helpers for UX, then hands the confirmed slots to
// schedulingService.proposeSlots, which stays the final authority (its own
// transaction re-checks conflicts, status, slot count and future-ness).
//
// Timezone: Asia/Jerusalem (same as MAIL_TZ / the rest of the WhatsApp layer).
// ============================================================================

const TZ = process.env.MAIL_TZ || "Asia/Jerusalem";

// Vague part-of-day -> [startHHMM, endHHMM]. Deterministic backend assumptions.
const DAYPART = {
  MORNING: ["09:00", "12:00"],
  NOON: ["12:00", "14:00"],
  AFTERNOON: ["13:00", "17:00"],
  EVENING: ["17:00", "21:00"],
};
// Bounds for open-ended phrasing ("after 17" / "before 15").
const OPEN_ENDED_HOURS = 4;
const EARLIEST = "08:00";
const LATEST = "22:00";

// Candidate-count bounds — mirror schedulingService's proposal rule (2-3). They
// are only used to decide "enough / not enough" for the preview; proposeSlots
// enforces the real rule.
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 3;

// Don't propose a slot that starts within this many minutes from now.
const START_BUFFER_MIN = 30;
// Step when scanning a window for a free block.
const SCAN_STEP_MIN = 30;

const DOW = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const HEBREW_DOW = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function toMinutes(hhmm) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function clampMinutes(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Wall-clock (Y-M-D H:M in TZ) -> the exact UTC Date for that instant. DST-safe.
function zonedWallToUtc(year, month, day, hour, minute) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
  const seenUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = seenUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

// Local calendar parts (in TZ) for a given instant.
function localParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { year: +p.year, month: +p.month, day: +p.day, weekdayIdx };
}

// Resolve a `day` token to a concrete local Y-M-D (the NEXT such day, today
// included — past-time filtering happens later on the actual slot).
function resolveLocalDate(dayToken, now = new Date()) {
  const t = localParts(now);
  const base = new Date(Date.UTC(t.year, t.month - 1, t.day, 12, 0, 0)); // midday anchor, DST-safe

  let addDays = 0;
  if (dayToken === "TODAY") {
    addDays = 0;
  } else if (dayToken === "TOMORROW") {
    addDays = 1;
  } else {
    const targetIdx = DOW.indexOf(dayToken);
    if (targetIdx === -1) return null;
    addDays = (targetIdx - t.weekdayIdx + 7) % 7; // 0..6, today if same weekday
  }
  const d = new Date(base.getTime() + addDays * 24 * 3600 * 1000);
  const lp = localParts(d);
  return { year: lp.year, month: lp.month, day: lp.day };
}

// { day, startTime, endTime, daypart } -> [startMinutes, endMinutes] or null.
function expandWindow(entry) {
  const lo = toMinutes(EARLIEST);
  const hi = toMinutes(LATEST);
  let start = toMinutes(entry.startTime);
  let end = toMinutes(entry.endTime);

  if (start != null && end != null) {
    if (end <= start) return null;
  } else if (entry.daypart && DAYPART[entry.daypart]) {
    const [ds, de] = DAYPART[entry.daypart];
    start = toMinutes(ds);
    end = toMinutes(de);
  } else if (start != null && end == null) {
    end = clampMinutes(start + OPEN_ENDED_HOURS * 60, lo, hi);
  } else if (start == null && end != null) {
    start = clampMinutes(end - OPEN_ENDED_HOURS * 60, lo, hi);
  } else {
    return null;
  }

  start = clampMinutes(start, lo, hi);
  end = clampMinutes(end, lo, hi);
  return end > start ? [start, end] : null;
}

function overlapsBusy(startMs, endMs, busyIntervals) {
  return (busyIntervals || []).some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return startMs < be && bs < endMs;
  });
}

// MAIN: structured availability -> up to MAX_CANDIDATES concrete slots.
// `busyIntervals` = schedulingService.getMentorBusyIntervals(mentorProfileId).
// Returns { slots: [{ startTime, endTime, dayToken }], reason }.
function generateCandidateSlots(availability, durationMinutes, busyIntervals, now = new Date()) {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { slots: [], reason: "bad-duration" };
  }
  const list = Array.isArray(availability) ? availability : [];
  if (list.length === 0) return { slots: [], reason: "no-availability" };

  const minStart = now.getTime() + START_BUFFER_MIN * 60 * 1000;

  // For each window: an ordered list of free candidate slots inside it.
  const perWindow = [];
  for (const entry of list.slice(0, 6)) {
    const date = resolveLocalDate(entry.day, now);
    const win = expandWindow(entry);
    if (!date || !win) continue;
    const [winStartMin, winEndMin] = win;

    const found = [];
    for (let m = winStartMin; m + duration <= winEndMin; m += SCAN_STEP_MIN) {
      const startD = zonedWallToUtc(date.year, date.month, date.day, Math.floor(m / 60), m % 60);
      const startMs = startD.getTime();
      const endMs = startMs + duration * 60 * 1000;
      if (startMs < minStart) continue;
      if (overlapsBusy(startMs, endMs, busyIntervals)) continue;
      found.push({
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        dayToken: entry.day,
      });
      if (found.length >= 2) break; // at most 2 per window
    }
    if (found.length) perWindow.push(found);
  }

  // Pass 1: one slot per distinct window (spread across days).
  // Pass 2: fill remaining capacity with each window's 2nd option.
  const slots = [];
  for (const w of perWindow) {
    if (slots.length >= MAX_CANDIDATES) break;
    slots.push(w[0]);
  }
  for (const w of perWindow) {
    if (slots.length >= MAX_CANDIDATES) break;
    if (w[1]) slots.push(w[1]);
  }

  if (slots.length < MIN_CANDIDATES) {
    return { slots: [], reason: slots.length === 0 ? "no-valid-slots" : "not-enough-slots" };
  }
  return { slots: slots.slice(0, MAX_CANDIDATES), reason: "ok" };
}

// "א׳ 17:30–18:15" for a preview line.
function formatSlotHebrew(slot) {
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  const wd = HEBREW_DOW[localParts(start).weekdayIdx] || "";
  const fmt = new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${wd} ${fmt.format(start)}–${fmt.format(end)}`;
}

module.exports = {
  DAYPART,
  OPEN_ENDED_HOURS,
  EARLIEST,
  LATEST,
  MIN_CANDIDATES,
  MAX_CANDIDATES,
  START_BUFFER_MIN,
  TZ,
  toMinutes,
  expandWindow,
  resolveLocalDate,
  zonedWallToUtc,
  generateCandidateSlots,
  formatSlotHebrew,
};
