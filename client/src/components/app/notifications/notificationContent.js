import fillTemplate from "../../../utils/fillTemplate";
import { formatDateTimeLabel } from "../../../utils/slotTime";
import { meetingFeedbackPath } from "../../../constants/routes";

/**
 * Turn a backend Notification row into what the panel renders.
 *
 * The backend never sends display strings — only a `type` and a small `payload`
 * snapshot ({ mentorName, menteeName, when, reason, rounds }). This module maps
 * (type, payload) onto an i18n key under `t.app.notifications.types` and fills
 * its placeholders, and decides where a click should take the user.
 */

// (type, payload) -> the specific i18n key. Several backend types fan out into
// more than one message depending on payload.reason.
export function notificationTypeKey(n) {
  const p = n.payload || {};
  switch (n.type) {
    case "MEETING_MATCHED":
      return p.when && p.when.start ? "MEETING_MATCHED" : "MEETING_MATCHED_NO_TIME";
    case "RESCHEDULE_REQUIRED":
      return p.reason === "moreSlots"
        ? "RESCHEDULE_REQUIRED_MORE_SLOTS"
        : "RESCHEDULE_REQUIRED_CANNOT_ATTEND";
    case "REQUEST_CANCELLED":
      if (p.reason === "withdrawn") return "REQUEST_CANCELLED_WITHDRAWN";
      if (p.reason === "cannotAttendMeeting")
        return p.byMentor
          ? "REQUEST_CANCELLED_CANNOT_ATTEND_MEETING_BY_MENTOR"
          : "REQUEST_CANCELLED_CANNOT_ATTEND_MEETING_BY_MENTEE";
      if (p.reason === "mentorCancelledMeeting") return "REQUEST_CANCELLED_MENTOR_MEETING";
      if (p.reason === "mentorCancelled") return "REQUEST_CANCELLED_MENTOR";
      if (p.reason === "noSlotsFound") return "REQUEST_CANCELLED_NO_SLOTS";
      return "REQUEST_CANCELLED";
    default:
      return n.type;
  }
}

// Where opening the notification should navigate. One bell serves a dual-role
// user, so the target is derived from the event, not from a stored role:
//   - "a mentee sent you a request" / "a mentee asked for new times" -> mentor area
//   - everything the user experiences as a mentee (or the post-match case where
//     the MENTOR is the one who can't attend) -> personal area
export function notificationNavTarget(n) {
  const p = n.payload || {};
  switch (n.type) {
    case "MENTORING_REQUEST_RECEIVED":
      return "/app/mentor-area";
    case "POST_MEETING_CHECK":
    case "FEEDBACK_REMINDER":
      // The dedicated feedback page for this specific meeting. Both the mentee
      // and the mentor receive these; the backend authorises each of them.
      return n.meetingId ? meetingFeedbackPath(n.meetingId) : "/app/personal-area";
    case "REQUEST_CANCELLED":
      if (p.reason === "withdrawn") return "/app/mentor-area";
      // post-match "cannot attend": the recipient is whoever did NOT act.
      if (p.reason === "cannotAttendMeeting")
        return p.byMentor ? "/app/personal-area" : "/app/mentor-area";
      return "/app/personal-area";
    case "RESCHEDULE_REQUIRED":
      if (p.reason === "moreSlots") return "/app/mentor-area";
      // post-match: notified party is whoever did NOT trigger it
      return p.byMentor ? "/app/personal-area" : "/app/mentor-area";
    default:
      return "/app/personal-area";
  }
}

export function describeNotification(n, t, lang) {
  const types = t.app.notifications.types;
  const key = notificationTypeKey(n);
  const p = n.payload || {};

  let when = "";
  const start =
    (p.when && p.when.start) || (n.meeting && n.meeting.scheduledStart) || null;
  if (start) {
    try {
      when = formatDateTimeLabel(start, lang);
    } catch {
      when = "";
    }
  }

  const template = types[key] || types[n.type] || n.type;
  const text = fillTemplate(template, {
    mentorName: p.mentorName || "",
    menteeName: p.menteeName || "",
    rounds: p.rounds != null ? p.rounds : "",
    when,
  });

  // Free-text note a participant wrote (Part 15 "cannot attend the meeting").
  // Authoritative copy lives on the cancelled Meeting row; this is the panel's
  // convenience snapshot.
  const explanation =
    typeof p.explanation === "string" ? p.explanation.trim() : "";

  return { text, explanation, navTo: notificationNavTarget(n) };
}

// Compact, localized "5 minutes ago" using the platform Intl API (no dependency).
export function relativeTimeLabel(iso, lang, justNowText) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 45) return justNowText;

  let rtf;
  try {
    rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }

  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const day = Math.round(hr / 24);
  if (day < 30) return rtf.format(-day, "day");
  const month = Math.round(day / 30);
  if (month < 12) return rtf.format(-month, "month");
  return rtf.format(-Math.round(month / 12), "year");
}
