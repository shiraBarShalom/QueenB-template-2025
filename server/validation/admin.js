const { z } = require("zod");

const roles = z.array(z.enum(["MENTEE", "MENTOR"])).min(1).max(2);
const nullableText = (max) => z.string().trim().max(max).nullable().optional();

const adminListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
});

const adminProfileSchema = z
  .object({
    background: nullableText(2000),
    jobTitle: nullableText(255),
    company: nullableText(255),
    yearsOfExperience: z.number().int().min(0).max(80).nullable().optional(),
    linkedinUrl: nullableText(2048),
    githubUrl: nullableText(2048),
    programmingLanguages: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    techStack: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    onboardingComplete: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Profile update cannot be empty");

const adminUserUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    isAdmin: z.boolean().optional(),
    isActive: z.boolean().optional(),
    roles: roles.optional(),
    profile: adminProfileSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Update cannot be empty");

const userIdSchema = z.coerce.number().int().positive();

const reportStatuses = [
  "WAITING_FOR_MENTOR_SLOTS",
  "WAITING_FOR_MENTEE_SELECTION",
  "MATCHED",
  "ATTENDANCE_CONFIRMED",
  "COMPLETED",
  "NOT_COMPLETED",
  "FEEDBACK_COMPLETED",
];

const adminReportQuerySchema = z.object({
  status: z.enum(reportStatuses).optional(),
  participantId: z.coerce.number().int().positive().optional(),
});

module.exports = {
  adminListSchema,
  adminUserUpdateSchema,
  userIdSchema,
  adminReportQuerySchema,
};
