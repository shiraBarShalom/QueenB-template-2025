// ============================================================================
// Authentication routes — /api/users/{register,login,logout,me}
// ============================================================================
// PORT of feature/mentorme-login-page's server/routes/users.js, trimmed to the
// login flow that was actually integrated (no onboarding /me/* writes, no
// forgot/reset-password) and adapted to this branch:
//
//   - business logic -> services/authService.js (Prisma, not raw SQL)
//   - kept: zod validation, per-route rate limiting, session regeneration on
//     login/register (session-fixation protection), the { success, data,
//     message } envelope, typed-error -> 409 / 401 mapping.
//
// Mounted at /api/users BEFORE routes/users.js in index.js, so these specific
// paths win and the existing users CRUD router is left completely untouched.
// ============================================================================

const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const {
  UserExistsError,
  InvalidCredentialsError,
  registerUser,
  authenticateUser,
  getSafeUserById,
  updateAccount,
  updateProfile,
  updateRoles,
  updateMentorProfile,
} = require("../services/authService");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  rolesSchema,
  profileSchema,
  mentorProfileSchema,
} = require("../validation/authSchemas");
const { validateBody } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { sendSuccess, sendError } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");
const {
  MentorApplicationError,
  submitApplication,
} = require("../services/mentorApplicationService");
const prisma = require("../prismaClient");
const userService = require("../services/userService");
const mentorService = require("../services/mentorService");
const { sessionCookieName } = require("../config/session");
const {
  InvalidResetTokenError,
  requestPasswordReset,
  resetPassword,
} = require("../services/passwordResetService");

const rateLimitMessage = (message) => ({ success: false, data: null, message });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "Too many authentication attempts. Please try again later."
  ),
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "Too many registration attempts. Please try again later."
  ),
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "Too many password reset requests. Please try again later."
  ),
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "Too many password reset attempts. Please try again later."
  ),
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

router.post(
  "/register",
  registrationLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    try {
      const user = await registerUser(req.validatedBody);
      await regenerateSession(req);
      req.session.user = { id: user.id, isAdmin: user.isAdmin };
      await saveSession(req);
      return sendSuccess(res, user, "Account created", 201);
    } catch (error) {
      if (error instanceof UserExistsError) {
        return sendError(res, error.message, 409);
      }
      throw error;
    }
  })
);

router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    try {
      const user = await authenticateUser(req.validatedBody);
      await regenerateSession(req);
      req.session.user = { id: user.id, isAdmin: user.isAdmin };
      await saveSession(req);
      return sendSuccess(res, user, "Signed in");
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return sendError(res, "Invalid email or password", 401);
      }
      throw error;
    }
  })
);

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await requestPasswordReset({
      email: req.validatedBody.email,
      requestedIp: req.ip,
      userAgent: req.get("user-agent"),
    });
    // Deliberately identical whether or not the account exists.
    return sendSuccess(
      res,
      null,
      "If an account exists for that email, reset instructions were sent."
    );
  })
);

router.post(
  "/reset-password",
  resetPasswordLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    try {
      await resetPassword(req.validatedBody);
      return sendSuccess(res, null, "Password reset. You can now sign in.");
    } catch (error) {
      if (error instanceof InvalidResetTokenError) {
        return sendError(res, error.message, 400);
      }
      throw error;
    }
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return sendSuccess(res, null, "Signed out");
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getSafeUserById(req.session.user.id);
    if (!user) {
      // Session points at a user that no longer exists — clear it.
      return req.session.destroy(() =>
        sendError(res, "Authentication required", 401)
      );
    }
    return sendSuccess(res, user);
  })
);

// ---------------------------------------------------------------------------
// Authenticated self-service. These act ONLY on the signed-in user's own row
// (id from the session, never the request body) and delegate to the existing,
// unchanged userService / mentorService. They exist so the Personal Area and
// the "Become a mentor" flow never call the unguarded /api/users/:id and
// /api/mentors CRUD from the browser. Additive — nothing else routes here.
// ---------------------------------------------------------------------------

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const body = req.body || {};
      if (body.displayName && Object.keys(body).length === 1) {
        const user = await updateAccount(req.session.user.id, body);
        return sendSuccess(res, user, "Account updated");
      }
      await userService.updateUser(req.session.user.id, body);
      const user = await getSafeUserById(req.session.user.id);
      return sendSuccess(res, user, "Profile updated");
    } catch (err) {
      return handleError(err, res);
    }
  })
);

router.put(
  "/me/roles",
  requireAuth,
  validateBody(rolesSchema),
  asyncHandler(async (req, res) => {
    const user = await updateRoles(req.session.user.id, req.validatedBody.roles);
    return sendSuccess(res, user, "Mentoring goals updated");
  })
);

router.patch(
  "/me/profile",
  requireAuth,
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    const user = await updateProfile(req.session.user.id, req.validatedBody);
    return sendSuccess(res, user, "Profile updated");
  })
);

router.post(
  "/me/mentor-application",
  requireAuth,
  validateBody(mentorProfileSchema),
  asyncHandler(async (req, res) => {
    try {
      const user = await submitApplication(req.session.user.id, req.validatedBody);
      return sendSuccess(res, user, "Mentor application submitted");
    } catch (error) {
      if (error instanceof MentorApplicationError) {
        return sendError(res, error.message, error.statusCode);
      }
      throw error;
    }
  })
);

// POST /api/users/me/mentor-profile — submit a mentor application.
// The user stays a mentee until an administrator approves the request.
router.post(
  "/me/mentor-profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    try {
      const {
        background,
        meetingCapacity,
        meetingDurationMinutes,
        mentoringTopics,
        adviceTopics,
        maxMeetings,
        acceptingRequests,
        ...userFields
      } = req.body || {};

      if (Object.keys(userFields).length > 0) {
        try {
          await userService.updateUser(userId, userFields);
        } catch {
          /* live DB may not have the Prisma User model */
        }
      }
      if (background) {
        await updateProfile(userId, { background });
      }

      const user = await submitApplication(userId, {
        adviceTopics: mentoringTopics || adviceTopics || [],
        maxMeetings: maxMeetings ?? meetingCapacity ?? null,
        meetingDurationMinutes: meetingDurationMinutes ?? null,
        acceptingRequests: acceptingRequests !== false,
        background,
      });
      return sendSuccess(res, { mentor: null, user }, "Mentor application submitted", 201);
    } catch (error) {
      if (error instanceof MentorApplicationError) {
        return sendError(res, error.message, error.statusCode);
      }
      return handleError(error, res);
    }
  })
);

// GET /api/users/me/mentor-profile — the signed-in mentor's own profile,
// in the same shape mentor discovery / the profile page already use.
router.get(
  "/me/mentor-profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const profile = await prisma.mentorProfile.findUnique({
        where: { userId: req.session.user.id },
      });
      if (!profile) return sendError(res, "You are not a mentor yet", 404);
      const mentor = await mentorService.getMentorById(profile.id);
      return sendSuccess(res, mentor, "Mentor profile fetched");
    } catch (err) {
      return handleError(err, res);
    }
  })
);

// PATCH /api/users/me/mentor-profile — an existing mentor edits her details.
router.patch(
  "/me/mentor-profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    if (!prisma.mentorProfile) {
      const parsed = mentorProfileSchema.safeParse(req.body || {});
      if (!parsed.success) return sendError(res, "Invalid mentor profile", 400);
      try {
        const user = await updateMentorProfile(userId, parsed.data);
        return sendSuccess(res, user, "Mentor profile updated");
      } catch (error) {
        return sendError(res, error.message, error.statusCode || 500);
      }
    }
    try {
      const profile = await prisma.mentorProfile.findUnique({ where: { userId } });
      if (!profile) return sendError(res, "You are not a mentor yet", 404);

      const {
        background,
        meetingCapacity,
        meetingDurationMinutes,
        mentoringTopics,
        technologies,
        spokenLanguages,
        ...userFields
      } = req.body || {};

      if (Object.keys(userFields).length > 0) {
        await userService.updateUser(userId, userFields);
      }

      const mentor = await mentorService.updateMentor(profile.id, {
        background,
        meetingCapacity,
        meetingDurationMinutes,
        mentoringTopics,
        technologies,
        spokenLanguages,
      });
      const user = await getSafeUserById(userId);
      return sendSuccess(res, { mentor, user }, "Mentor profile updated");
    } catch (err) {
      return handleError(err, res);
    }
  })
);

module.exports = router;
