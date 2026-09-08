// ============================================================================
// Auth request schemas. Ported/trimmed from feature/mentorme-login-page
// (server/validation/users.js). Only the schemas the integrated login flow
// needs are kept — the onboarding / password-reset schemas were intentionally
// left behind (see the integration report).
//
//   - `.strict()` rejects unknown fields (e.g. a client trying to send
//     `isAdmin`) — a security property carried over from the incoming branch.
//   - email is trimmed + lower-cased so lookups are consistent.
//   - `displayName` maps onto our Prisma User.fullName in services/authService.
// ============================================================================
const { z } = require("zod");

const email = z.string().trim().toLowerCase().email().max(255);
const displayName = z.string().trim().min(2).max(100);

const registerSchema = z
  .object({
    displayName,
    email,
    password: z
      .string()
      .min(12, "Password must contain at least 12 characters")
      .max(128, "Password must contain at most 128 characters"),
  })
  .strict();

const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();

const forgotPasswordSchema = z.object({ email }).strict();

const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(200),
    password: z
      .string()
      .min(12, "Password must contain at least 12 characters")
      .max(128, "Password must contain at most 128 characters"),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
