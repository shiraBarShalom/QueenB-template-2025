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

/**
 * Half-open interval overlap in epoch ms: [aStart, aEnd) vs [bStart, bEnd).
 * Touching exactly at a boundary (aEnd === bStart) is NOT an overlap — a meeting
 * that ends when another begins is fine. Mirrors schedulingService.intervalsOverlap
 * on the server (which stays authoritative).
 */
export function intervalsOverlapMs(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
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

/** e.g. "Monday, 8 September, 10:00" — a full date + start time. Accepts ms or ISO. */
export function formatDateTimeLabel(value, lang) {
  const d = new Date(value);
  return d.toLocaleString(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** e.g. "10:00 – 10:30". Accepts ms or ISO for each end. */
export function formatTimeRange(start, end, lang) {
  return `${formatTime(new Date(start).getTime(), lang)} – ${formatTime(
    new Date(end).getTime(),
    lang
  )}`;
}

/** One { startTime, endTime } payload entry for the backend. */
export function toPayloadSlot(startMs, durationMinutes) {
  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(startMs + durationMinutes * 60 * 1000).toISOString(),
  };
}
