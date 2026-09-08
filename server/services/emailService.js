// ============================================================================
// emailService — the ONE abstraction routes/services call for outbound email.
// ============================================================================
// Public surface:
//   sendMeetingScheduledEmail({ mentee, mentor, meeting })  -> both participants
//   sendMentorThankYouEmail({ mentor, menteeName, meeting }) -> mentor only
//   isEmailConfigured()
//
// SAFETY CONTRACT (do not weaken):
//   * Email is a NOTIFICATION SIDE EFFECT, never part of a business transaction.
//     Callers invoke these functions AFTER their DB work has committed.
//   * These functions NEVER throw. Every failure path resolves to a result
//     object and is logged. An SMTP outage cannot take down the API.
//   * Nothing here writes to the database or mutates domain state.
//
// Recipient language: the project has NO persisted per-user UI locale (the
// client keeps the chosen language in localStorage only; User has no locale
// column; `spokenLanguages` is explicitly NOT a UI language). So every email
// is rendered in MAIL_DEFAULT_LOCALE (default "he", the app's DEFAULT_LANG).
// A per-recipient `locale` argument is honoured if a caller ever has one.
// ============================================================================

const fs = require("fs");
const path = require("path");

const { sendRawEmail, isEmailConfigured } = require("./email/transport");
const {
  renderMeetingScheduledEmail,
  renderMentorThankYouEmail,
  normalizeLocale,
} = require("./email/templates");
const { buildGoogleCalendarUrl } = require("./email/googleCalendar");

const DEFAULT_LOCALE = normalizeLocale(process.env.MAIL_DEFAULT_LOCALE || "he");
const MAIL_TZ = process.env.MAIL_TZ || "Asia/Jerusalem";
// Optional publicly hosted logo. If unset we embed the bundled asset by CID.
const MAIL_LOGO_URL = process.env.MAIL_LOGO_URL || "";
const LOGO_PATH = path.join(__dirname, "..", "assets", "match-queens-logo.png");
const LOGO_CID = "match-queens-logo";

// Resolve how the logo is referenced in the HTML + the matching attachment.
// Never throws; if the bundled file is missing we simply drop the image.
function resolveLogo() {
  if (MAIL_LOGO_URL) return { src: MAIL_LOGO_URL, attachments: [] };
  try {
    if (fs.existsSync(LOGO_PATH)) {
      return {
        src: `cid:${LOGO_CID}`,
        attachments: [
          {
            filename: "match-queens-logo.png",
            path: LOGO_PATH,
            cid: LOGO_CID,
            contentDisposition: "inline",
          },
        ],
      };
    }
  } catch {
    /* fall through */
  }
  return { src: "", attachments: [] };
}

function pickLocale(explicit) {
  return normalizeLocale(explicit || DEFAULT_LOCALE);
}

// ----------------------------------------------------------------------------
// 1. Meeting confirmation — sent to BOTH participants.
// ----------------------------------------------------------------------------
// Shapes (all fields already loaded by the caller — this service reads no DB):
//   mentee  : { email, name, locale? }
//   mentor  : { email, name, locale? }
//   meeting : { id, scheduledStart, scheduledEnd }
//
// Returns { attempted, results: [{ role, to, ...outcome }] } and never throws.
async function sendMeetingScheduledEmail({ mentee, mentor, meeting } = {}) {
  const out = { attempted: false, results: [] };
  try {
    if (!mentee || !mentor || !meeting) {
      console.error("[email] sendMeetingScheduledEmail: missing mentee/mentor/meeting");
      return out;
    }
    const start = new Date(meeting.scheduledStart);
    const end = new Date(meeting.scheduledEnd);
    const logo = resolveLogo();

    const recipients = [
      { role: "MENTEE", self: mentee, other: mentor },
      { role: "MENTOR", self: mentor, other: mentee },
    ];

    out.attempted = true;
    for (const r of recipients) {
      if (!r.self.email) {
        out.results.push({ role: r.role, to: null, error: "no recipient email" });
        continue;
      }
      const locale = pickLocale(r.self.locale);

      // Google Calendar link is per-locale (localized title/description). A
      // failure to build it just drops the button — never blocks the email.
      const calendarUrl = buildGoogleCalendarUrl({
        title: calendarTitle(locale),
        start,
        end,
        details: calendarDetails(locale, r.role === "MENTEE" ? mentor.name : mentee.name),
        location: "Match Queens",
      });

      const { subject, html, text } = renderMeetingScheduledEmail({
        locale,
        role: r.role,
        recipientName: r.self.name,
        otherName: r.other.name,
        start,
        end,
        tz: MAIL_TZ,
        logoSrc: logo.src,
        calendarUrl,
      });

      const res = await sendRawEmail({
        to: r.self.email,
        subject,
        html,
        text,
        attachments: logo.attachments,
      });
      out.results.push({ role: r.role, to: r.self.email, ...res });
    }
  } catch (err) {
    // Absolute backstop — sendMeetingScheduledEmail must never throw.
    console.error("[email] sendMeetingScheduledEmail crashed:", err && err.message);
  }
  return out;
}

// ----------------------------------------------------------------------------
// 2. Mentor thank-you — sent ONCE to the mentor after the mentee's first
//    post-meeting feedback for a meeting that occurred.
// ----------------------------------------------------------------------------
//   mentor : { email, name, locale? }
async function sendMentorThankYouEmail({ mentor } = {}) {
  const out = { attempted: false, result: null };
  try {
    if (!mentor || !mentor.email) {
      console.error("[email] sendMentorThankYouEmail: missing mentor email");
      return out;
    }
    const locale = pickLocale(mentor.locale);
    const logo = resolveLogo();
    const { subject, html, text } = renderMentorThankYouEmail({
      locale,
      mentorName: mentor.name,
      logoSrc: logo.src,
    });
    out.attempted = true;
    out.result = await sendRawEmail({
      to: mentor.email,
      subject,
      html,
      text,
      attachments: logo.attachments,
    });
  } catch (err) {
    console.error("[email] sendMentorThankYouEmail crashed:", err && err.message);
  }
  return out;
}

// Localized Google Calendar event title / description.
function calendarTitle(locale) {
  return {
    he: "פגישת מנטורינג – Match Queens",
    ar: "جلسة إرشاد – Match Queens",
    en: "Match Queens Mentoring Meeting",
  }[locale];
}
function calendarDetails(locale, otherName) {
  const n = otherName || "";
  return {
    he: `פגישת מנטורינג עם ${n} דרך Match Queens.`,
    ar: `جلسة إرشاد مع ${n} عبر Match Queens.`,
    en: `Mentoring meeting with ${n} via Match Queens.`,
  }[locale];
}

module.exports = {
  isEmailConfigured,
  sendMeetingScheduledEmail,
  sendMentorThankYouEmail,
  DEFAULT_LOCALE,
  MAIL_TZ,
};
