const express = require("express");
const { rateLimit } = require("express-rate-limit");
const router = express.Router();
const {
  UserExistsError,
  InvalidCredentialsError,
  registerUser,
  authenticateUser,
  getUserById,
  updateProfile,
  updateMentorProfile,
  updateAccount,
  updateRoles,
} = require("../services/usersService");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  accountSchema,
  rolesSchema,
  profileSchema,
  mentorProfileSchema,
} = require("../validation/users");
const { validateBody } = require("../middleware/validate");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { sendSuccess, sendError } = require("../utils/responseHandler");
const {
  InvalidResetTokenError,
  requestPasswordReset,
  resetPassword,
} = require("../services/passwordResetService");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: "Too many authentication attempts. Please try again later.",
  },
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: "Too many registration attempts. Please try again later.",
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: "Too many password reset requests. Please try again later.",
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: "Too many password reset attempts. Please try again later.",
  },
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
    res.clearCookie("mentorme.sid", {
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
    const user = await getUserById(req.session.user.id);
    if (!user) {
      return sendError(res, "Authentication required", 401);
    }
    return sendSuccess(res, user);
  })
);

router.patch(
  "/me",
  requireAuth,
  validateBody(accountSchema),
  asyncHandler(async (req, res) => {
    const user = await updateAccount(req.session.user.id, req.validatedBody);
    return sendSuccess(res, user, "Account updated");
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

router.patch(
  "/me/mentor-profile",
  requireAuth,
  validateBody(mentorProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await updateMentorProfile(req.session.user.id, req.validatedBody);
    return sendSuccess(res, user, "Mentor profile updated");
  })
);

router.get(
  "/admin/me",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.session.user.id);
    return sendSuccess(res, user);
  })
);

module.exports = router;
