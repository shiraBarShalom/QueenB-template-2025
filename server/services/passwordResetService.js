const db = require("../db");
const { hashPassword } = require("./userService");
const { generateResetToken, hashToken } = require("../security/tokens");
const { sessionPool, sessionTableName } = require("../config/session");

const RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

class InvalidResetTokenError extends Error {
  constructor(message = "Invalid or expired reset link") {
    super(message);
    this.name = "InvalidResetTokenError";
  }
}

async function deliverResetLink({ email, displayName, token }) {
  const link = `${CLIENT_ORIGIN}/reset-password?token=${token}`;
  console.log(
    `[password-reset] (dev) reset link for ${displayName || ""} <${email}>: ${link}`
  );
}

function toInet(value) {
  if (!value) return null;
  const text = String(value).replace(/^::ffff:/, "").trim();
  if (/^[0-9a-fA-F:.]+$/.test(text)) return text;
  return null;
}

async function requestPasswordReset({ email, requestedIp, userAgent }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const found = await db.query(
    `SELECT id, email, display_name
     FROM users
     WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
    [normalizedEmail]
  );
  const user = found.rows[0];
  if (!user) return;

  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await db.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id]
  );
  await db.query(
    `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at, requested_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt, toInet(requestedIp), userAgent || null]
  );

  try {
    await deliverResetLink({
      email: user.email,
      displayName: user.display_name,
      token: rawToken,
    });
  } catch (error) {
    await db.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [tokenHash]);
    console.error("[password-reset] delivery failed:", error.message);
  }
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const found = await db.query(
    `SELECT id, user_id, used_at, expires_at
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );
  const row = found.rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new InvalidResetTokenError();
  }

  await db.query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1", [
    row.user_id,
    hashPassword(password),
  ]);
  await db.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [row.user_id]
  );

  try {
    await sessionPool.query(
      `DELETE FROM ${sessionTableName} WHERE sess -> 'user' ->> 'id' = $1`,
      [String(row.user_id)]
    );
  } catch (error) {
    console.error("[password-reset] session revoke failed:", error.message);
  }
}

module.exports = {
  InvalidResetTokenError,
  requestPasswordReset,
  resetPassword,
};
