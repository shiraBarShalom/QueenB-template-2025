// ============================================================================
// Password reset — token issue + redeem.
// ============================================================================
// Adapted from origin/main's server/services/passwordResetService.js:
//   - raw pg `password_reset_tokens` table  ->  Prisma `PasswordResetToken`
//   - Resend email provider                 ->  a dev console log of the link
//     (no external dependency). Swap `deliverResetLink` for a real provider
//     before production — this is the ONLY change needed.
//   - session revocation on reset uses the connect-pg-simple `session` table
//     via the shared session pool (sessions are infra, not a Prisma model).
//
// Behaviour preserved from main: tokens are single-use, expiring, stored only
// as a SHA-256 hash; a successful reset revokes every existing session for the
// user; "forgot password" never reveals whether an email exists.
// ============================================================================

const prisma = require("../prismaClient");
const { hashPassword } = require("./userService");
const { generateResetToken, hashToken } = require("../security/tokens");
const { sessionPool } = require("../config/session");

const RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

class InvalidResetTokenError extends Error {
  constructor(message = "Invalid or expired reset link") {
    super(message);
    this.name = "InvalidResetTokenError";
  }
}

// DEV delivery: log the link. Replace with a real email provider for prod.
async function deliverResetLink({ email, displayName, token }) {
  const link = `${CLIENT_ORIGIN}/reset-password?token=${token}`;
  console.log(
    `[password-reset] (dev) reset link for ${displayName || ""} <${email}>: ${link}`
  );
}

async function requestPasswordReset({ email, requestedIp, userAgent }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail, isActive: true },
    select: { id: true, email: true, fullName: true },
  });
  // Always return quietly — never reveal whether the account exists.
  if (!user) return;

  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    // Invalidate any outstanding tokens for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: requestedIp || null,
        userAgent: userAgent || null,
      },
    }),
  ]);

  try {
    await deliverResetLink({
      email: user.email,
      displayName: user.fullName,
      token: rawToken,
    });
  } catch (error) {
    // Delivery failed — drop the token so a dead link can't linger.
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    console.error("[password-reset] delivery failed:", error.message);
  }
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    throw new InvalidResetTokenError();
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  // Revoke every existing session for this user.
  try {
    await sessionPool.query(
      "DELETE FROM \"session\" WHERE sess -> 'user' ->> 'id' = $1",
      [String(row.userId)]
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
