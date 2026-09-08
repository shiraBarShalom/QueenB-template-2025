// ============================================================================
// Phone-number normalization for the WhatsApp Companion (feature/whatsapp-mentor).
// ============================================================================
// Dependency-free E.164 normalization. Used in exactly two places:
//   - scripts/enroll-whatsapp.js  (write side: store User.whatsappPhone)
//   - services/whatsappService.js (read side: match an incoming Twilio "From")
// so a number stored by the script and a number arriving from Twilio always
// compare equal.
//
// Twilio delivers the sender as "whatsapp:+9725...". We strip that prefix,
// keep only digits, and re-apply a single leading "+". Local Israeli style
// ("05...") is expanded with a default country code so a demo enroller can
// paste a number in the format they know.
// ============================================================================

// Only used when the input has NO country code (a bare "0..." local number).
// International inputs (with "+" or "00") are never touched by this.
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "972";

// "whatsapp:+972501234567" / "WhatsApp: +972..." -> "+972501234567"
function stripWhatsappPrefix(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/^whatsapp:/i, "")
    .trim();
}

// Returns a normalized "+<digits>" string, or null when there is nothing usable.
// NOT a validator — see isE164 for that.
function normalizeE164(input) {
  let s = stripWhatsappPrefix(input);
  if (!s) return null;

  const hadPlus = s.startsWith("+");
  s = s.replace(/\D/g, "");
  if (!s) return null;

  if (hadPlus) return `+${s}`;
  if (s.startsWith("00")) return `+${s.slice(2)}`; // international "00" prefix
  if (s.startsWith("0")) return `+${DEFAULT_COUNTRY_CODE}${s.slice(1)}`; // local "0.."
  return `+${s}`; // already has a country code, just missing the "+"
}

// Pull the E.164 number out of a Twilio "From" field.
function extractWhatsAppNumber(from) {
  return normalizeE164(from);
}

// Strict-enough E.164 shape check: "+" then 7..15 digits, no leading zero.
function isE164(value) {
  return /^\+[1-9]\d{6,14}$/.test(String(value == null ? "" : value));
}

module.exports = {
  normalizeE164,
  extractWhatsAppNumber,
  isE164,
  stripWhatsappPrefix,
  DEFAULT_COUNTRY_CODE,
};
