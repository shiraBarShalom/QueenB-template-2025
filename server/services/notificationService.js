// ============================================================================
// In-app notification store + read model.
// ============================================================================
// The Notification table already existed in the schema as a "record store"
// (see schema.prisma). This module is the ONE place that writes IN_APP rows and
// the ONE place the bell/panel reads them.
//
// Design rules:
//   * Notifications are a SIDE EFFECT of a domain event, created by the backend
//     — never invented by the frontend. Where a notification must be consistent
//     with a scheduling transition (mentee must learn slots were offered iff the
//     round was actually created) `createNotifications(tx, ...)` is called with
//     the SAME interactive transaction as the status change, so the row and the
//     notification commit or roll back together.
//   * IN_APP notifications are "delivered" the moment they are written, so they
//     are stored with status SENT + sentAt = now. `readAt` is NULL until the
//     recipient opens them; the unread badge counts readAt IS NULL.
//   * AUTH: every read/mutation is scoped to a single recipientId. A caller can
//     only ever touch rows whose recipientId matches the acting user id it was
//     given — changing an id in the URL cannot reach another user's rows.
//     `actingUserId` is resolved from the route exactly like the rest of the
//     project's AUTH SEAM (see routes/scheduling.js); when real sessions land,
//     that one line changes and this service is unaffected.
// ============================================================================

const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");
const { parseId } = require("./userService");

// Newest first; cap the panel so one busy user can't pull thousands of rows.
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Shape the panel needs to render a line and decide where a click should go.
const PANEL_SELECT = {
  id: true,
  type: true,
  channel: true,
  readAt: true,
  createdAt: true,
  requestId: true,
  meetingId: true,
  payload: true,
  request: { select: { id: true, status: true } },
  meeting: {
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      status: true,
      attemptNumber: true,
    },
  },
};

// ----------------------------------------------------------------------------
// Writes — only ever called from the backend (services / requestService), most
// of them inside a scheduling transaction.
// ----------------------------------------------------------------------------

// Build one IN_APP notification row payload (not persisted here). `payload` is a
// small denormalized snapshot (names / times) so the panel needs no extra join.
function buildInApp({ recipientId, type, requestId = null, meetingId = null, payload = null }) {
  return {
    recipientId,
    type,
    channel: "IN_APP",
    status: "SENT",
    sentAt: new Date(),
    requestId,
    meetingId,
    payload: payload || undefined,
  };
}

// Create N IN_APP notifications. `client` is a Prisma client OR an interactive
// transaction handle — pass the tx when the notification must be atomic with a
// scheduling transition. Rows with a null recipientId are skipped defensively.
async function createNotifications(client, rows) {
  const db = client || prisma;
  const data = (Array.isArray(rows) ? rows : [rows])
    .filter((r) => r && r.recipientId != null)
    .map(buildInApp);
  if (data.length === 0) return { count: 0 };
  return db.notification.createMany({ data });
}

// Convenience single-row form.
function createNotification(client, row) {
  return createNotifications(client, [row]);
}

// ----------------------------------------------------------------------------
// Reads / mutations for the bell + panel. All scoped to one recipient.
// ----------------------------------------------------------------------------

// Lazily create any POST_MEETING_CHECK notifications this user is now due (a
// meeting they took part in whose time has passed). No scheduler exists, so the
// bell/panel APIs are where "the meeting ended" is noticed. Best-effort: a
// failure here must never break reading notifications. Lazy require breaks the
// notificationService <-> postMeetingService cycle.
async function materializeDue(recipientId) {
  try {
    const {
      materializeDuePostMeetingNotificationsForUser,
      materializeDueFeedbackRemindersForUser,
    } = require("./postMeetingService");
    // Order matters: the POST_MEETING_CHECK is the anchor the 2-day reminder
    // cadence measures from, so create it first.
    await materializeDuePostMeetingNotificationsForUser(recipientId);
    await materializeDueFeedbackRemindersForUser(recipientId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("post-meeting notification materialization failed:", err.message);
  }
}

async function listForUser(rawUserId, { limit } = {}) {
  const recipientId = parseId(rawUserId, "userId");
  const take = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  await materializeDue(recipientId);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take,
      select: PANEL_SELECT,
    }),
    prisma.notification.count({
      where: { recipientId, channel: "IN_APP", readAt: null },
    }),
  ]);

  return { items, unreadCount };
}

async function unreadCountForUser(rawUserId) {
  const recipientId = parseId(rawUserId, "userId");
  await materializeDue(recipientId);
  const unreadCount = await prisma.notification.count({
    where: { recipientId, channel: "IN_APP", readAt: null },
  });
  return { unreadCount };
}

// Mark ONE notification read. Scoped by recipientId so a mismatched id simply
// affects 0 rows -> 404, never another user's notification.
async function markRead(rawUserId, rawNotificationId) {
  const recipientId = parseId(rawUserId, "userId");
  const id = parseId(rawNotificationId, "notificationId");

  const { count } = await prisma.notification.updateMany({
    where: { id, recipientId, readAt: null },
    data: { readAt: new Date() },
  });

  // count 0 means: already read (no-op, fine) OR not this user's / missing.
  if (count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id, recipientId },
      select: { id: true },
    });
    if (!exists) throw new ApiError(`Notification ${id} not found`, 404);
  }

  return unreadCountForUser(recipientId);
}

async function markAllRead(rawUserId) {
  const recipientId = parseId(rawUserId, "userId");
  await prisma.notification.updateMany({
    where: { recipientId, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
  return { unreadCount: 0 };
}

module.exports = {
  buildInApp,
  createNotification,
  createNotifications,
  listForUser,
  unreadCountForUser,
  markRead,
  markAllRead,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
