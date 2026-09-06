/**
 * Pure date/time helpers for the mentor slot picker (Part 3).
 *
 * A "slot" in the picker is just the start instant in epoch ms. The end is
 * derived at submit time as start + the mentor's meetingDurationMinutes, which
 * is the contract the backend expects:
 *   POST /api/requests/:id/propose-slots  { slots: [{ startTime, endTime }] }
 *
 * Backend rules mirrored here for UX only (server stays authoritative):
 *   startTime must be in the future           -> isPastStart()
 *   endTime must be after startTime           -> guaranteed (duration > 0)
 *   exactly 2–3 slots                         -> enforced in the page/picker
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

// Start times live on a 30-minute grid between these hours (inclusive of the
// last hour at :00). Fixed grid rather than a duration-derived one so the
// options stay predictable regardless of meeting length.
const FIRST_HOUR = 8;
const LAST_HOUR = 21;
const STEP_MINUTES = 30;

export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function todayStart() {
  return startOfDay(Date.now());
}

/** All candidate start instants (epoch ms) for the given local day. */
export function generateDayTimes(dayStartMs) {
  const out = [];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += STEP_MINUTES) {
      if (hour === LAST_HOUR && minute > 0) break;
      const d = new Date(dayStartMs);
      d.setHours(hour, minute, 0, 0);
      out.push(d.getTime());
    }
  }
  return out;
}

export function isPastStart(ms) {
  return ms <= Date.now();
}

export function formatDayLabel(ms, lang) {
  return new Date(ms).toLocaleDateString(lang, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatDayShort(ms, lang) {
  return {
    weekday: new Date(ms).toLocaleDateString(lang, { weekday: "short" }),
    day: new Date(ms).toLocaleDateString(lang, { day: "numeric" }),
  };
}

export function formatTime(ms, lang) {
  return new Date(ms).toLocaleTimeString(lang, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** e.g. "Monday, 10:00" — used in the selected-times list. */
export function formatSlotLabel(ms, lang) {
  const day = new Date(ms).toLocaleDateString(lang, { weekday: "long" });
  return `${day}, ${formatTime(ms, lang)}`;
}

/** One { startTime, endTime } payload entry for the backend. */
export function toPayloadSlot(startMs, durationMinutes) {
  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(startMs + durationMinutes * 60 * 1000).toISOString(),
  };
}
