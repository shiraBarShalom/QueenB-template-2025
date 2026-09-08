// ============================================================================
// Domain: WhatsApp Companion for mentors (feature/whatsapp-mentor).
// Mounted at /api/whatsapp (see server/index.js).
// ============================================================================
// This router owns ONLY the Twilio webhook HTTP shape:
//   * verify X-Twilio-Signature (integrations/twilio.js middleware)
//   * read From / Body from the form-urlencoded body (express.urlencoded is
//     already global in index.js — nothing extra needed here)
//   * hand off to whatsappService (identity + intent + existing data)
//   * always answer Twilio with a valid TwiML document and HTTP 200, and never
//     leak an internal error / stack trace to the caller
//
// No business logic lives here. No scheduling writes happen anywhere on this
// path — the only "action" whatsappService returns is a link to the existing
// React propose-slots page.
// ============================================================================

const express = require("express");
const router = express.Router();

const { validateTwilioSignature, twiml } = require("../integrations/twilio");
const whatsappService = require("../services/whatsappService");

// GET /api/whatsapp — plain health ping (useful when pasting the URL in a
// browser to check the route is mounted). Twilio only ever POSTs.
router.get("/", (_req, res) => {
  res.json({ success: true, data: { service: "whatsapp-webhook" }, message: "ok" });
});

// POST /api/whatsapp — Twilio "When a message comes in" webhook.
router.post("/", validateTwilioSignature, async (req, res) => {
  const from = req.body.From || req.body.from || "";
  const body = req.body.Body || req.body.body || "";

  let replyText;
  try {
    const result = await whatsappService.handleIncomingMessage({ from, body });
    replyText = (result && result.text) || whatsappService.GENERIC_ERROR_TEXT;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp] handler failed:", err && err.stack ? err.stack : err);
    replyText = whatsappService.GENERIC_ERROR_TEXT;
  }

  res.set("Content-Type", "text/xml");
  return res.status(200).send(twiml(replyText));
});

module.exports = router;
