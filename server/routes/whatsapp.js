// ============================================================================
// Domain: WhatsApp Companion for mentors (feature/whatsapp-mentor).
// Mounted at /api/whatsapp (see server/index.js).
// ============================================================================
// Transport: 360dialog Sandbox (integrations/whatsapp360.js). This router owns
// ONLY the provider HTTP shape:
//   * accept the 360dialog webhook JSON (express.json() is already global)
//   * extract { from, body } — where body is the typed text OR the id of a
//     tapped interactive button / list row — via whatsapp360.parseInbound
//   * ACK with HTTP 200 immediately (so 360dialog never retries / loops)
//   * hand it to the UNCHANGED whatsappService, which returns a reply object
//   * send that reply via whatsapp360.sendReply (interactive with automatic
//     plain-text fallback)
//
// Non-actionable events (status/delivery callbacks, unsupported message types,
// malformed bodies) are 200'd and ignored — no reply is sent.
//
// No business logic here. No scheduling writes anywhere on this path. The prior
// Twilio transport (integrations/twilio.js) is untouched for rollback.
// ============================================================================

const express = require("express");
const router = express.Router();

const whatsapp360 = require("../integrations/whatsapp360");
const whatsappService = require("../services/whatsappService");

// GET /api/whatsapp — health ping. Also echoes hub.challenge if a provider ever
// probes the URL that way (harmless; 360dialog Sandbox does not require it).
router.get("/", (req, res) => {
  const challenge = req.query["hub.challenge"];
  if (challenge !== undefined) return res.status(200).send(String(challenge));
  return res.json({
    success: true,
    data: { service: "whatsapp-webhook", provider: "360dialog" },
    message: "ok",
  });
});

// POST /api/whatsapp — 360dialog inbound webhook.
router.post("/", (req, res) => {
  // 1. Acknowledge first — fast, unconditional, body-independent.
  res.sendStatus(200);

  // 2. Parse the payload (never throws).
  let inbound;
  try {
    inbound = whatsapp360.parseInbound(req.body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp] inbound parse error:", err && err.message);
    return;
  }

  // 3. Only text / button tap / list pick are actionable.
  const actionableKinds = ["text", "interactive", "button"];
  if (!actionableKinds.includes(inbound.kind)) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp] ignored non-actionable webhook event (${inbound.reason})`);
    return;
  }

  const body = inbound.kind === "text" ? inbound.text : inbound.replyId;

  // 4. Generate + send the reply out of band; failures are logged, never thrown.
  handleAndReply({ from: inbound.from, body }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[whatsapp] processing failed:", err && err.stack ? err.stack : err);
  });
});

async function handleAndReply({ from, body }) {
  const result = await whatsappService.handleIncomingMessage({ from, body });
  const reply =
    result && typeof result === "object" && result.text
      ? result
      : { text: whatsappService.GENERIC_ERROR_TEXT };

  try {
    const sent = await whatsapp360.sendReply(from, reply);
    // eslint-disable-next-line no-console
    console.log(`[whatsapp] replied to ${from} via 360dialog (${sent.mode}, HTTP ${sent.status})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[whatsapp] 360dialog send failed for ${from}: HTTP ${err.status || "?"} — ` +
        `${JSON.stringify(err.responseBody || err.message)}`
    );
  }
}

module.exports = router;
