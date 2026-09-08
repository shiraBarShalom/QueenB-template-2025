// ============================================================================
// Google Calendar "add event" link builder.
// ============================================================================
// This produces a plain https://calendar.google.com/calendar/render?... URL —
// the standard, unauthenticated "prefill a new event" endpoint. It does NOT
// touch the Google Calendar API, OAuth, or the recipient's Google account:
// clicking the button just opens Google Calendar with the fields filled in and
// the user presses "Save" herself.
//
// Timestamps use the UTC "basic" form Google expects: YYYYMMDDTHHMMSSZ, derived
// straight from the stored Meeting.scheduledStart / .scheduledEnd Date objects,
// so it is timezone-assumption free (the instant is exact; Google renders it in
// the viewer's own calendar timezone).
//
// Every value is passed through encodeURIComponent. If anything here throws the
// caller treats the button as absent — it must never affect the Meeting.
// ============================================================================

// Date -> "YYYYMMDDTHHMMSSZ" (UTC). Throws on an invalid Date.
function toGoogleUtcStamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid date passed to toGoogleUtcStamp");
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Build the render URL. Returns a string, or null if it could not be built
// (bad dates / unexpected input) — callers must tolerate null.
//
//   { title, start, end, details, location }
//     title    short event title (already localized by the caller)
//     start    Date | ISO string  — Meeting.scheduledStart
//     end      Date | ISO string  — Meeting.scheduledEnd
//     details  optional multi-line description
//     location optional short location string
function buildGoogleCalendarUrl({ title, start, end, details, location } = {}) {
  try {
    const params = new URLSearchParams();
    params.set("action", "TEMPLATE");
    params.set("text", title || "Match Queens Mentoring Meeting");
    params.set("dates", `${toGoogleUtcStamp(start)}/${toGoogleUtcStamp(end)}`);
    if (details) params.set("details", details);
    if (location) params.set("location", location);
    // URLSearchParams encodes spaces as "+"; Google accepts that, but %20 is
    // safer across mail clients that re-wrap the href.
    return `https://calendar.google.com/calendar/render?${params
      .toString()
      .replace(/\+/g, "%20")}`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[email] google calendar url build failed:", err.message);
    return null;
  }
}

module.exports = { buildGoogleCalendarUrl, toGoogleUtcStamp };
