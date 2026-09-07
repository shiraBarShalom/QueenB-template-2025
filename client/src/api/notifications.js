import axios from "axios";

/**
 * Thin client for the in-app notification bell/panel.
 *
 * Same conventions as api/mentorScheduling.js / api/menteeScheduling.js: one
 * axios instance on "/api" (CRA proxy -> :5000), unwrap the
 * { success, data, message } envelope, re-throw a plain Error carrying `.status`.
 *
 * AUTH SEAM: `userId` is the current user's id from useCurrentUser() (sent as a
 * path segment, exactly like GET /api/mentees/:userId/scheduling). The server
 * scopes every row to `recipientId === userId`, so this can only ever read/write
 * the current user's own notifications.
 */
const http = axios.create({ baseURL: "/api" });

function toClientError(err) {
  const status = err && err.response ? err.response.status : 0;
  const message =
    (err && err.response && err.response.data && err.response.data.message) ||
    (err && err.message) ||
    "Network error";
  const clientError = new Error(message);
  clientError.status = status;
  return clientError;
}

/**
 * GET /api/users/:userId/notifications?limit=30
 * -> { items: [...], unreadCount }
 */
export async function fetchNotifications(userId, { limit = 30 } = {}) {
  try {
    const res = await http.get(`/users/${userId}/notifications`, { params: { limit } });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/** GET /api/users/:userId/notifications/unread-count -> { unreadCount } */
export async function fetchUnreadCount(userId) {
  try {
    const res = await http.get(`/users/${userId}/notifications/unread-count`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/** POST /api/users/:userId/notifications/:id/read -> { unreadCount } */
export async function markNotificationRead(userId, notificationId) {
  try {
    const res = await http.post(`/users/${userId}/notifications/${notificationId}/read`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/** POST /api/users/:userId/notifications/read-all -> { unreadCount: 0 } */
export async function markAllNotificationsRead(userId) {
  try {
    const res = await http.post(`/users/${userId}/notifications/read-all`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}
