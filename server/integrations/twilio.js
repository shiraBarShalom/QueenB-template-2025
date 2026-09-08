// ============================================================================
// Twilio integration helper — the ONLY place that knows Twilio's wire format.
// ============================================================================
// Keeps two concerns out of routes/whatsapp.js and services/whatsappService.js:
//   1. building a Twilio-safe TwiML reply (XML escaping handled by the SDK), and
//   2. validating the X-Twilio-Signature header on the incoming webhook.
//
// SIGNATURE VALIDATION — local dev vs production
// ---------------------------------------------------------------------------
// Twilio signs each webhook with your Auth Token over the FULL public URL plus
// the POSTed form fields. To verify it we must reconstruct the exact same URL
// Twilio used. Behind ngrok / a tunnel the Express-perceived host & protocol
// are wrong, so the cleanest fix is to tell the server its own public origin:
//
//   APP_BASE_URL=https://<your-subdomain>.ngrok-free.app
//
// When APP_BASE_URL is set we build "<APP_BASE_URL><originalUrl>" and never look
// at the (proxied) Host header at all. If you instead rely on X-Forwarded-*
// headers, also set TRUST_PROXY=true so Express honours them (see index.js).
//
// Whether validation runs at all:
//   TWILIO_VALIDATE_SIGNATURE=true   -> always validate (needs TWILIO_AUTH_TOKEN)
//   TWILIO_VALIDATE_SIGNATURE=false  -> never validate  (local sandbox testing)
//   unset                           -> validate in production, and in dev only
//                                      when TWILIO_AUTH_TOKEN is present
// A failed validation returns 403 with a short TwiML body and NEVER reaches the
// service layer.
// ============================================================================

const twilio = require("twilio");

// Build a <Response><Message>…</Message></Response> document. The SDK escapes
// the text, so any user/DB content is safe to pass straight in.
function twiml(message) {
  const response = new twilio.twiml.MessagingResponse();
  response.message(String(message == null ? "" : message));
  return response.toString();
}

// Decide whether signature validation should run for this process.
function shouldValidate() {
  const explicit = process.env.TWILIO_VALIDATE_SIGNATURE;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return Boolean(process.env.TWILIO_AUTH_TOKEN);
}

// Reconstruct the absolute URL Twilio used to sign this request.
function requestUrl(req) {
  const base = process.env.APP_BASE_URL;
  if (base) return `${base.replace(/\/+$/, "")}${req.originalUrl}`;
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}${req.originalUrl}`;
}

// Express middleware. Verifies X-Twilio-Signature or short-circuits with 403.
function validateTwilioSignature(req, res, next) {
  if (!shouldValidate()) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp] Twilio signature validation is OFF. Set TWILIO_VALIDATE_SIGNATURE=true " +
          "with TWILIO_AUTH_TOKEN and APP_BASE_URL to enable it."
      );
    }
    return next();
  }

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp] Signature validation is required but TWILIO_AUTH_TOKEN is missing — rejecting."
    );
    res.set("Content-Type", "text/xml");
    return res.status(403).send(twiml("Server is not configured for WhatsApp yet."));
  }

  const signature = req.get("X-Twilio-Signature") || "";
  const url = requestUrl(req);
  const params = req.body && typeof req.body === "object" ? req.body : {};

  let valid = false;
  try {
    valid = twilio.validateRequest(token, signature, url, params);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp] signature validation threw:", err && err.message);
    valid = false;
  }

  if (!valid) {
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp] Invalid Twilio signature (url used for check: ${url}).`);
    res.set("Content-Type", "text/xml");
    return res.status(403).send(twiml("Could not verify this request."));
  }

  return next();
}

module.exports = {
  twiml,
  shouldValidate,
  requestUrl,
  validateTwilioSignature,
};
