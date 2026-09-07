const crypto = require("crypto");

function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

module.exports = { generateResetToken, hashToken };
