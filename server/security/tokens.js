// Password-reset token helpers. Ported verbatim from origin/main
// (server/security/tokens.js). No external dependency — Node crypto only.
// The raw token goes only into the emailed link; the DB stores just its
// SHA-256 hash (see services/passwordResetService.js).
const crypto = require("crypto");

function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

module.exports = { generateResetToken, hashToken };
