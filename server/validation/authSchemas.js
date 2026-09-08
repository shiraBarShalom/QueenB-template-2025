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

const optionalText = (max) =>
  z.union([z.string().trim().max(max), z.null()]).optional();

const optionalHttpsUrl = z
  .union([
    z
      .string()
      .trim()
      .max(2048)
      .url()
      .refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((value) => (value === "" ? null : value));

const shortList = z.array(z.string().trim().min(1).max(80)).max(20).optional();

const accountSchema = z.object({ displayName }).strict();

const rolesSchema = z
  .object({
    roles: z
      .array(z.enum(["MENTEE", "MENTOR"]))
      .min(1, "Choose at least one mentoring goal")
      .max(2),
  })
  .strict();

const profileSchema = z
  .object({
    background: optionalText(2000),
    linkedinUrl: optionalHttpsUrl,
    githubUrl: optionalHttpsUrl,
    jobTitle: optionalText(255),
    company: optionalText(255),
    yearsOfExperience: z.number().int().min(0).max(80).nullable().optional(),
    programmingLanguages: shortList,
    techStack: shortList,
    onboardingComplete: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one profile field is required");

const mentorProfileSchema = z
  .object({
    adviceTopics: shortList,
    maxMeetings: z.number().int().min(1).max(100).nullable().optional(),
    meetingDurationMinutes: z.number().int().min(15).max(240).nullable().optional(),
    acceptingRequests: z.boolean().optional(),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  accountSchema,
  rolesSchema,
  profileSchema,
  mentorProfileSchema,
};
