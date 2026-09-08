const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { requireAdmin } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../middleware/asyncHandler");
const { sendSuccess, sendError } = require("../utils/responseHandler");
const {
  AdminActionError,
  listUsers,
  getAdminStats,
  getUserById,
  updateUserByAdmin,
  revokeUserSessions,
  sendUserPasswordReset,
} = require("../services/adminUsersService");
const {
  listReport,
  getReportById,
  listCalendar,
  listAlerts,
  listParticipants,
} = require("../services/adminMeetingsService");
const {
  adminListSchema,
  adminUserUpdateSchema,
  userIdSchema,
  adminReportQuerySchema,
} = require("../validation/admin");

const router = express.Router();
const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireAdmin);

router.get(
  "/me",
  asyncHandler(async (req, res) => sendSuccess(res, await getUserById(req.session.user.id)))
);

function parseUserId(req, res) {
  const parsed = userIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    sendError(res, "Invalid user id", 400);
    return null;
  }
  return parsed.data;
}

router.get(
  "/stats",
  asyncHandler(async (req, res) => sendSuccess(res, await getAdminStats()))
);

router.get(
  "/alerts",
  asyncHandler(async (req, res) => sendSuccess(res, await listAlerts()))
);

router.get(
  "/report",
  asyncHandler(async (req, res) => {
    const parsed = adminReportQuerySchema.safeParse({
      status: req.query.status || undefined,
      participantId: req.query.participantId || undefined,
    });
    if (!parsed.success) return sendError(res, "Invalid report filters", 400);
    return sendSuccess(res, {
      rows: await listReport(parsed.data),
      participants: await listParticipants(),
    });
  })
);

router.get(
  "/report/:id",
  asyncHandler(async (req, res) => {
    const parsed = userIdSchema.safeParse(req.params.id);
    if (!parsed.success) return sendError(res, "Invalid meeting id", 400);
    const row = await getReportById(parsed.data);
    return row ? sendSuccess(res, row) : sendError(res, "Meeting not found", 404);
  })
);

router.get(
  "/calendar",
  asyncHandler(async (req, res) => sendSuccess(res, await listCalendar()))
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const parsed = adminListSchema.safeParse(req.query);
    if (!parsed.success) return sendError(res, "Invalid list filters", 400);
    return sendSuccess(res, await listUsers(parsed.data));
  })
);

router.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const id = parseUserId(req, res);
    if (!id) return undefined;
    const user = await getUserById(id);
    return user ? sendSuccess(res, user) : sendError(res, "User not found", 404);
  })
);

router.patch(
  "/users/:id",
  mutationLimiter,
  validateBody(adminUserUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseUserId(req, res);
    if (!id) return undefined;
    try {
      const user = await updateUserByAdmin(
        req.session.user.id,
        id,
        req.validatedBody
      );
      return sendSuccess(res, user, "User updated");
    } catch (error) {
      if (error instanceof AdminActionError) {
        return sendError(res, error.message, error.statusCode);
      }
      throw error;
    }
  })
);

router.delete(
  "/users/:id/sessions",
  mutationLimiter,
  asyncHandler(async (req, res) => {
    const id = parseUserId(req, res);
    if (!id) return undefined;
    const count = await revokeUserSessions(req.session.user.id, id);
    return sendSuccess(res, { revokedSessions: count }, "Sessions revoked");
  })
);

router.post(
  "/users/:id/password-reset",
  mutationLimiter,
  asyncHandler(async (req, res) => {
    const id = parseUserId(req, res);
    if (!id) return undefined;
    try {
      await sendUserPasswordReset(req.session.user.id, id, {
        requestedIp: req.ip,
        userAgent: req.get("user-agent"),
      });
      return sendSuccess(res, null, "Password reset email requested");
    } catch (error) {
      if (error instanceof AdminActionError) {
        return sendError(res, error.message, error.statusCode);
      }
      throw error;
    }
  })
);

module.exports = router;
