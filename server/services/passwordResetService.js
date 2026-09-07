const db = require("../db");
const env = require("../config/env");
const { hashPassword } = require("../security/passwords");
const { generateResetToken, hashToken } = require("../security/tokens");
const emailService = require("./emailService");

class InvalidResetTokenError extends Error {}

async function requestPasswordReset({ email, requestedIp, userAgent }) {
  const { resetTtlMinutes } = env.getEmailConfig();
  const userResult = await db.query(
    `SELECT id, email, display_name
     FROM users
     WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
    [email]
  );

  if (userResult.rowCount === 0) return;

  const user = userResult.rows[0];
  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  await db.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
    [user.id]
  );
  await db.query(
    `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at, requested_ip, user_agent)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'), $4, $5)`,
    [user.id, tokenHash, resetTtlMinutes, requestedIp || null, userAgent || null]
  );

  try {
    await emailService.sendPasswordResetEmail({
      email: user.email,
      displayName: user.display_name,
      token: rawToken,
    });
  } catch (error) {
    await db.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [
      tokenHash,
    ]);
    console.error("Password reset email delivery failed:", error.message);
  }
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    if (tokenResult.rowCount === 0) {
      throw new InvalidResetTokenError("Invalid or expired reset link");
    }

    const reset = tokenResult.rows[0];
    const passwordHash = await hashPassword(password);
    await client.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND is_active = TRUE",
      [passwordHash, reset.user_id]
    );
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [reset.user_id]
    );
    await client.query(
      "DELETE FROM user_sessions WHERE sess -> 'user' ->> 'id' = $1",
      [String(reset.user_id)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  InvalidResetTokenError,
  requestPasswordReset,
  resetPassword,
};
