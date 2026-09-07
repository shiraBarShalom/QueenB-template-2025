const express = require("express");
// Mounted at "/api" (see index.js): its paths hang off /api/users/:userId/...
const router = express.Router();

const notificationService = require("../services/notificationService");
const { sendSuccess } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");

// ===========================================================================
// Domain: in-app notifications for the authenticated user.
//
// AUTH SEAM: identical to the rest of the project — there is no session layer
// yet, so `:userId` in the path IS the acting user (mirrors
// GET /api/mentees/:userId/scheduling and the `actingUserId` body field on the
// scheduling routes). notificationService scopes EVERY query and mutation to
// `recipientId === :userId`, so changing the id in the URL only ever reaches
// that id's own rows — never another user's. When real auth lands, replace the
// `req.params.userId` argument with the session user id in these five handlers;
// the service does not change.
// ===========================================================================

// GET /api/users/:userId/notifications?limit=30
// -> { items: [{ id, type, readAt, createdAt, requestId, meetingId, payload, request, meeting }], unreadCount }
router.get("/users/:userId/notifications", async (req, res) => {
  try {
    const data = await notificationService.listForUser(req.params.userId, {
      limit: req.query.limit,
    });
    return sendSuccess(res, data, "Notifications fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/users/:userId/notifications/unread-count -> { unreadCount }
router.get("/users/:userId/notifications/unread-count", async (req, res) => {
  try {
    const data = await notificationService.unreadCountForUser(req.params.userId);
    return sendSuccess(res, data, "Unread count fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/users/:userId/notifications/read-all -> { unreadCount: 0 }
// Declared before the ":notificationId" route so "read-all" is not parsed as an id.
router.post("/users/:userId/notifications/read-all", async (req, res) => {
  try {
    const data = await notificationService.markAllRead(req.params.userId);
    return sendSuccess(res, data, "All notifications marked read");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/users/:userId/notifications/:notificationId/read -> { unreadCount }
router.post("/users/:userId/notifications/:notificationId/read", async (req, res) => {
  try {
    const data = await notificationService.markRead(
      req.params.userId,
      req.params.notificationId
    );
    return sendSuccess(res, data, "Notification marked read");
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
