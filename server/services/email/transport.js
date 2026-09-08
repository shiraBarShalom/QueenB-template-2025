// ============================================================================
// SMTP transport (nodemailer) — the ONLY place SMTP is spoken.
// ============================================================================
// Configuration is environment-only (see server/.env.example). Nothing here is
// hardcoded and no secret is ever logged.
//
// If mail is not configured (typical in local dev) the module still loads and
// `sendRawEmail` becomes a safe no-op that logs "delivery unavailable" and
// returns { skipped: true } — the server boots and every feature keeps working.
//
// Gmail: set MAIL_HOST=smtp.gmail.com, MAIL_PORT=465, MAIL_SECURE=true,
// MAIL_USER=<the dedicated gmail address>, MAIL_PASS=<a 16-char App Password>
// (NOT the account password; requires 2-Step Verification on that account).
// ============================================================================

let nodemailer = null;
try {
  // Lazy-tolerant require so a missing dependency cannot crash boot.
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

const cfg = {
  enabled: String(process.env.MAIL_ENABLED || "").toLowerCase() !== "false",
  host: process.env.MAIL_HOST || "",
  port: Number(process.env.MAIL_PORT || 465),
  secure: String(process.env.MAIL_SECURE || "true").toLowerCase() !== "false",
  user: process.env.MAIL_USER || "",
  pass: process.env.MAIL_PASS || "",
  from:
    process.env.MAIL_FROM ||
    (process.env.MAIL_USER ? `Match Queens <${process.env.MAIL_USER}>` : ""),
};

function isEmailConfigured() {
  return Boolean(
    nodemailer && cfg.enabled && cfg.host && cfg.user && cfg.pass
  );
}

let _transport = null;
function getTransport() {
  if (!isEmailConfigured()) return null;
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // Bounded so a slow/unreachable SMTP host can never hang a caller for long.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return _transport;
}

// Send one message. NEVER throws — returns a small result object instead, so
// callers (which run this AFTER their DB transaction has committed) can log and
// move on regardless of the outcome.
//
//   { to, subject, html, text, attachments? }
// -> { skipped: true } | { sent: true, messageId } | { error: "<message>" }
async function sendRawEmail({ to, subject, html, text, attachments }) {
  if (!isEmailConfigured()) {
    // eslint-disable-next-line no-console
    console.log(
      `[email] delivery unavailable (SMTP not configured) — would have sent "${subject}" to ${to}`
    );
    return { skipped: true };
  }
  try {
    const transport = getTransport();
    const info = await transport.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
      text,
      attachments,
    });
    // eslint-disable-next-line no-console
    console.log(`[email] sent "${subject}" to ${to} (id ${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Provider errors are caught here and nowhere allowed to propagate. Do not
    // log credentials — err.message from nodemailer does not contain the pass.
    // eslint-disable-next-line no-console
    console.error(`[email] send failed for "${subject}" to ${to}: ${err.message}`);
    return { error: err.message };
  }
}

module.exports = { isEmailConfigured, sendRawEmail, mailConfig: cfg };
