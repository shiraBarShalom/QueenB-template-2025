// ============================================================================
// Email copy + rendering for the two transactional emails.
// ============================================================================
//   1. meeting confirmation  — sent to BOTH participants when a Meeting is
//                              successfully created (mentee selected a slot).
//   2. mentor thank-you      — sent to the mentor once, after the mentee's
//                              first post-meeting feedback for a meeting that
//                              actually occurred.
//
// Everything is per-recipient and per-locale (he / ar / en). he + ar render
// RTL; en renders LTR. Each renderer returns { subject, html, text } — a plain
// table-based HTML body (inline styles, email-client safe) plus a plain-text
// fallback. No external CSS, no web fonts, no remote images except an optional
// hosted logo URL; otherwise the logo is referenced by a cid: handle the
// caller attaches.
// ============================================================================

const SUPPORTED_LOCALES = ["he", "ar", "en"];
const DEFAULT_LOCALE = "he";

// he -> he-IL etc. for Intl date formatting.
const LOCALE_TAG = { he: "he-IL", ar: "ar", en: "en-US" };
const DIR = { he: "rtl", ar: "rtl", en: "ltr" };

function normalizeLocale(loc) {
  return SUPPORTED_LOCALES.includes(loc) ? loc : DEFAULT_LOCALE;
}

// ----------------------------------------------------------------------------
// Date / time formatting. `tz` is an IANA zone (default Asia/Jerusalem — the
// project has no server-side timezone handling; this is the documented
// assumption, overridable via MAIL_TZ). The instant itself is exact.
// ----------------------------------------------------------------------------
function formatDate(date, locale, tz) {
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: tz,
    }).format(date);
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

function formatTime(date, locale, tz) {
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
      hour12: locale === "en",
    }).format(date);
  } catch {
    return new Date(date).toISOString().slice(11, 16);
  }
}

// ----------------------------------------------------------------------------
// Minimal HTML escaping for interpolated names.
// ----------------------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escape a URL for use inside an href="" attribute: only & and " need it (the
// URL is already percent-encoded by buildGoogleCalendarUrl).
function escUrl(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ----------------------------------------------------------------------------
// Shared HTML skeleton. Soft pink details on a light background, one crown
// logo, one prominent CTA (optional), a lightweight footer.
// ----------------------------------------------------------------------------
const PINK = "#E5387E";
const PINK_SOFT = "#FDEDF4";
const INK = "#2B2B33";
const MUTED = "#8A8A97";

function renderShell({ locale, logoSrc, heading, bodyLines, meta, cta, footer }) {
  const dir = DIR[locale];
  const align = dir === "rtl" ? "right" : "left";
  const lang = locale;

  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:${INK};text-align:${align};">${line}</p>`
    )
    .join("");

  const metaBlock = meta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
         <tr><td style="background:${PINK_SOFT};border-radius:12px;padding:16px 18px;">
           <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:${INK};text-align:${align};">${meta.date}</p>
           <p style="margin:0;font-size:16px;line-height:1.6;color:${INK};text-align:${align};">${meta.time}</p>
         </td></tr>
       </table>`
    : "";

  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;">
         <tr><td style="border-radius:999px;background:${PINK};">
           <a href="${escUrl(cta.href)}" target="_blank"
              style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;
                     color:#ffffff;text-decoration:none;border-radius:999px;">${cta.label}</a>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F6;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;
                    border:1px solid #EFEFF3;" dir="${dir}">
        <tr><td style="padding:26px 30px 8px;text-align:${align};">
          <img src="${logoSrc}" alt="Match Queens" height="40"
               style="height:40px;width:auto;display:block;border:0;outline:none;">
        </td></tr>
        <tr><td style="padding:10px 30px 4px;">
          <h1 style="margin:0 0 14px;font-size:21px;line-height:1.5;font-weight:800;
                     color:${INK};text-align:${align};">${heading}</h1>
          ${paragraphs}
          ${metaBlock}
          ${ctaBlock}
        </td></tr>
        <tr><td style="padding:12px 30px 26px;border-top:1px solid #F0F0F4;">
          <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:${align};">
            ${footer}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ============================================================================
// 1. Meeting confirmation
// ============================================================================
// role: "MENTEE" | "MENTOR" — controls the one differing sentence.
// names are raw strings; interpolated with escaping.
const MEETING_COPY = {
  he: {
    subject: "נקבעה לך פגישת מנטורינג 👑",
    heading: (name) => `היי ${name} 💗`,
    lineMentee: (other) => `איזה כיף, מלכה! נקבעה לך פגישה עם ${other}.`,
    lineMentor: (other) => `נקבעה לך פגישת מנטורינג עם ${other}. תודה שאת נותנת מהזמן והידע שלך 💗`,
    closing: "מחכות לך בפגישה ✨",
    signature: "Match Queens",
    cta: "הוסיפי ליומן Google",
    footer: "קיבלת את המייל הזה כי נקבעה פגישה דרך Match Queens.",
    dateLabel: (v) => `📅 ${v}`,
    timeLabel: (v) => `🕒 ${v}`,
  },
  ar: {
    subject: "تم تحديد موعد جلسة إرشاد 👑",
    heading: (name) => `مرحبًا ${name} 💗`,
    lineMentee: (other) => `يا لها من فرصة رائعة! تم تحديد موعد جلستك مع ${other}.`,
    lineMentor: (other) => `تم تحديد موعد جلسة إرشاد مع ${other}. شكرًا لِمنحك من وقتك ومعرفتك 💗`,
    closing: "بانتظارك في الجلسة ✨",
    signature: "Match Queens",
    cta: "أضيفي إلى تقويم Google",
    footer: "لقد تلقيتِ هذا البريد لأنه تم تحديد موعد جلسة عبر Match Queens.",
    dateLabel: (v) => `📅 ${v}`,
    timeLabel: (v) => `🕒 ${v}`,
  },
  en: {
    subject: "Your mentoring meeting is scheduled 👑",
    heading: (name) => `Hi ${name} 💗`,
    lineMentee: (other) => `Wonderful news — your meeting with ${other} is booked.`,
    lineMentor: (other) => `Your mentoring meeting with ${other} is booked. Thank you for giving your time and knowledge 💗`,
    closing: "We can't wait to see you there ✨",
    signature: "Match Queens",
    cta: "Add to Google Calendar",
    footer: "You're receiving this because a meeting was scheduled through Match Queens.",
    dateLabel: (v) => `📅 ${v}`,
    timeLabel: (v) => `🕒 ${v}`,
  },
};

function renderMeetingScheduledEmail({
  locale,
  role,
  recipientName,
  otherName,
  start,
  end,
  tz,
  logoSrc,
  calendarUrl,
}) {
  const loc = normalizeLocale(locale);
  const c = MEETING_COPY[loc];
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  const dateStr = formatDate(startDate, loc, tz);
  const timeStr = `${formatTime(startDate, loc, tz)}–${formatTime(endDate, loc, tz)}`;

  const rn = esc(recipientName || "");
  const on = esc(otherName || "");
  const mainLine = role === "MENTOR" ? c.lineMentor(on) : c.lineMentee(on);

  const html = renderShell({
    locale: loc,
    logoSrc,
    heading: c.heading(rn),
    bodyLines: [mainLine, c.closing, `<strong>${esc(c.signature)}</strong>`],
    meta: { date: esc(c.dateLabel(dateStr)), time: esc(c.timeLabel(timeStr)) },
    cta: calendarUrl ? { href: calendarUrl, label: esc(c.cta) } : null,
    footer: esc(c.footer),
  });

  const textLines = [
    stripTags(c.heading(recipientName || "")),
    "",
    stripTags(mainLine),
    "",
    c.dateLabel(dateStr),
    c.timeLabel(timeStr),
    "",
    c.closing,
    c.signature,
  ];
  if (calendarUrl) {
    textLines.push("", `${c.cta}: ${calendarUrl}`);
  }
  textLines.push("", c.footer);

  return { subject: c.subject, html, text: textLines.join("\n") };
}

// ============================================================================
// 2. Mentor thank-you
// ============================================================================
const THANKYOU_COPY = {
  he: {
    subject: "תודה שאת חלק מ‑Match Queens 👑",
    heading: (name) => `היי ${name} 💗`,
    lines: [
      "תודה שהקדשת מהזמן, מהניסיון ומהידע שלך ועזרת לקדם עוד מלכה בדרך שלה 👑",
      "ההשפעה שלך משמעותית לנו ולמנטיות של Match Queens.",
      "תודה שאת חלק מהקהילה שלנו,",
    ],
    signature: "Match Queens",
    footer: "קיבלת את המייל הזה בעקבות פגישת מנטורינג שהתקיימה דרך Match Queens.",
  },
  ar: {
    subject: "شكرًا لكونكِ جزءًا من Match Queens 👑",
    heading: (name) => `مرحبًا ${name} 💗`,
    lines: [
      "شكرًا لتخصيصكِ من وقتكِ ومن خبرتكِ ومعرفتكِ، ولمساعدتكِ ملكة أخرى على المضي في طريقها 👑",
      "تأثيركِ يعني الكثير لنا ولِمنتيات Match Queens.",
      "شكرًا لكونكِ جزءًا من مجتمعنا،",
    ],
    signature: "Match Queens",
    footer: "لقد تلقيتِ هذا البريد بعد جلسة إرشاد جرت عبر Match Queens.",
  },
  en: {
    subject: "Thank you for being part of Match Queens 👑",
    heading: (name) => `Hi ${name} 💗`,
    lines: [
      "Thank you for sharing your time, your experience and your knowledge, and for helping another queen move forward on her path 👑",
      "Your impact means a great deal to us and to the Match Queens mentees.",
      "Thank you for being part of our community,",
    ],
    signature: "Match Queens",
    footer: "You're receiving this after a mentoring meeting that took place through Match Queens.",
  },
};

function renderMentorThankYouEmail({ locale, mentorName, logoSrc }) {
  const loc = normalizeLocale(locale);
  const c = THANKYOU_COPY[loc];
  const mn = esc(mentorName || "");

  const html = renderShell({
    locale: loc,
    logoSrc,
    heading: c.heading(mn),
    bodyLines: [...c.lines.map(esc), `<strong>${esc(c.signature)}</strong>`],
    meta: null,
    cta: null,
    footer: esc(c.footer),
  });

  const text = [
    stripTags(c.heading(mentorName || "")),
    "",
    ...c.lines,
    c.signature,
    "",
    c.footer,
  ].join("\n");

  return { subject: c.subject, html, text };
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, "");
}

module.exports = {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
  renderMeetingScheduledEmail,
  renderMentorThankYouEmail,
};
