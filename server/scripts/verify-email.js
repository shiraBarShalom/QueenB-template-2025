/* eslint-disable no-console */
// ============================================================================
// Manual verification for the additive email feature (meeting confirmation +
// mentor thank-you). Same style as the other verify-*.js scripts.
//
// Pure / offline checks only — it does NOT require SMTP and does NOT touch the
// database. It asserts:
//   * the Google Calendar URL is well-formed with correct UTC timestamps
//   * he/ar/en templates render, are personalized, and carry the right dir
//   * the email dispatch functions NEVER throw and degrade safely when SMTP
//     is not configured (return { skipped: true })
//
// Run:  node scripts/verify-email.js
// Exit: 0 = all passed, 1 = at least one failure.
// ============================================================================

const { buildGoogleCalendarUrl, toGoogleUtcStamp } = require("../services/email/googleCalendar");
const tpl = require("../services/email/templates");
const emailService = require("../services/emailService");

let passed = 0;
let failed = 0;
const ok = (n) => (passed++, console.log(`  ✓ ${n}`));
const bad = (n, d) => (failed++, console.log(`  ✗ ${n}\n      ${d}`));
const assert = (n, c, d = "") => (c ? ok(n) : bad(n, d || "assertion false"));

const start = new Date("2026-09-20T13:00:00.000Z");
const end = new Date("2026-09-20T14:30:00.000Z");

async function main() {
  console.log("\nGoogle Calendar link");
  {
    assert(
      "UTC stamp format YYYYMMDDTHHMMSSZ",
      toGoogleUtcStamp(start) === "20260920T130000Z",
      toGoogleUtcStamp(start)
    );
    const url = buildGoogleCalendarUrl({
      title: "פגישת מנטורינג – Match Queens",
      start,
      end,
      details: "with Dana",
      location: "Match Queens",
    });
    assert("url points at calendar render endpoint", url.startsWith("https://calendar.google.com/calendar/render?"));
    assert("url carries action=TEMPLATE", url.includes("action=TEMPLATE"));
    assert(
      "url dates use exact stored start/end in UTC",
      url.includes("dates=20260920T130000Z%2F20260920T143000Z"),
      url
    );
    assert("title is URL-encoded (no raw spaces / hebrew)", !/[ ֐-׿]/.test(url));
    assert("bad dates -> null, never throws", buildGoogleCalendarUrl({ title: "x", start: "nope", end }) === null);
  }

  console.log("\nTemplates (he / ar / en)");
  for (const locale of ["he", "ar", "en"]) {
    const dir = locale === "en" ? "ltr" : "rtl";
    const mentee = tpl.renderMeetingScheduledEmail({
      locale, role: "MENTEE", recipientName: "Shira", otherName: "Dana",
      start, end, tz: "Asia/Jerusalem", logoSrc: "cid:logo",
      calendarUrl: "https://calendar.google.com/calendar/render?x=1",
    });
    const mentor = tpl.renderMeetingScheduledEmail({
      locale, role: "MENTOR", recipientName: "Dana", otherName: "Shira",
      start, end, tz: "Asia/Jerusalem", logoSrc: "cid:logo",
      calendarUrl: "https://calendar.google.com/calendar/render?x=1",
    });
    assert(`[${locale}] mentee email has subject/html/text`, !!(mentee.subject && mentee.html && mentee.text));
    assert(`[${locale}] html declares dir="${dir}"`, mentee.html.includes(`dir="${dir}"`), mentee.html.slice(0, 120));
    assert(`[${locale}] mentee body names the mentee`, mentee.html.includes("Shira") && mentee.text.includes("Shira"));
    assert(`[${locale}] mentee body names the other participant`, mentee.html.includes("Dana"));
    assert(`[${locale}] mentor wording differs from mentee wording`, mentor.html !== mentee.html);
    assert(`[${locale}] CTA button present with calendar href`, mentee.html.includes("calendar.google.com/calendar/render"));
    assert(`[${locale}] plain-text fallback has no HTML tags`, !/<[a-z][\s\S]*>/i.test(mentee.text));

    const ty = tpl.renderMentorThankYouEmail({ locale, mentorName: "Dana", logoSrc: "cid:logo" });
    assert(`[${locale}] thank-you email has subject/html/text`, !!(ty.subject && ty.html && ty.text));
    assert(`[${locale}] thank-you names the mentor`, ty.html.includes("Dana") && ty.text.includes("Dana"));
    assert(`[${locale}] thank-you has NO calendar CTA`, !ty.html.includes("calendar.google.com"));
  }
  {
    const unknown = tpl.renderMeetingScheduledEmail({
      locale: "de", role: "MENTEE", recipientName: "A", otherName: "B",
      start, end, tz: "Asia/Jerusalem", logoSrc: "", calendarUrl: null,
    });
    assert("unknown locale falls back to default (he)", unknown.subject === tpl.renderMeetingScheduledEmail({
      locale: "he", role: "MENTEE", recipientName: "A", otherName: "B",
      start, end, tz: "Asia/Jerusalem", logoSrc: "", calendarUrl: null,
    }).subject);
    assert("missing calendarUrl -> email still renders, no CTA", !unknown.html.includes("Add to Google") && !!unknown.html);
  }

  console.log("\nDispatch safety (no SMTP configured here)");
  {
    assert("isEmailConfigured() is false without MAIL_* env", emailService.isEmailConfigured() === false);

    const r1 = await emailService.sendMeetingScheduledEmail({
      mentee: { email: "mentee@example.test", name: "Shira" },
      mentor: { email: "mentor@example.test", name: "Dana" },
      meeting: { id: 1, scheduledStart: start, scheduledEnd: end },
    });
    assert("meeting dispatch attempted for both participants", r1.attempted && r1.results.length === 2);
    assert("meeting dispatch skipped cleanly (no throw, no send)", r1.results.every((x) => x.skipped === true));

    const r2 = await emailService.sendMentorThankYouEmail({ mentor: { email: "mentor@example.test", name: "Dana" } });
    assert("thank-you dispatch skipped cleanly", r2.attempted && r2.result && r2.result.skipped === true);

    // Malformed input must still not throw.
    const r3 = await emailService.sendMeetingScheduledEmail({});
    assert("malformed meeting dispatch input -> no throw", r3 && r3.attempted === false);
    const r4 = await emailService.sendMentorThankYouEmail({ mentor: {} });
    assert("thank-you with no email -> no throw", r4 && r4.attempted === false);
  }

  console.log(`\n${"=".repeat(50)}\n  PASSED: ${passed}    FAILED: ${failed}\n${"=".repeat(50)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSCRIPT ERROR:", e);
  process.exit(1);
});
