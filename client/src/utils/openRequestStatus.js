/**
 * Client mirror of server requestService.CLOSED_REQUEST_STATUSES.
 * Anything else is "open" and blocks a new mentee→mentor request.
 * Keep in sync with server/services/requestService.js — do not invent rules here.
 */
export const CLOSED_REQUEST_STATUSES = [
  "CANCELLED",
  "REJECTED",
  "COMPLETED",
  "FEEDBACK_COMPLETED",
  "NOT_COMPLETED",
];

const CLOSED = new Set(CLOSED_REQUEST_STATUSES);

/** True when status is still active for duplicate-request purposes. */
export function isOpenRequestStatus(status) {
  return Boolean(status) && !CLOSED.has(status);
}

/**
 * UX bucket for discovery / profile labels.
 * Accepts Prisma statuses or Part-2 aliases from GET …/requests/open.
 * @returns {"pending"|"scheduled"|null}
 */
export function openRequestUiKind(status) {
  if (!status) return null;
  if (
    status === "MATCHED" ||
    status === "ATTENDANCE_CONFIRMED" ||
    status === "SCHEDULED"
  ) {
    return "scheduled";
  }
  if (isOpenRequestStatus(status) || status === "PENDING_MENTOR" || status === "PENDING_MENTEE") {
    return "pending";
  }
  return null;
}

/**
 * Withdraw is legal only from waiting states (schedulingService.withdraw).
 * Part-2 aliases from the open-request API are included.
 */
export function canWithdrawOpenRequest(status) {
  return (
    status === "WAITING_FOR_MENTOR_SLOTS" ||
    status === "WAITING_FOR_MENTEE_SELECTION" ||
    status === "PENDING_MENTOR" ||
    status === "PENDING_MENTEE"
  );
}

/**
 * Map mentee request rows (GET /api/mentees/:id/requests) → mentor userId → request.
 * Assumes rows are newest-first; keeps the first open request per mentor.
 */
export function buildOpenRequestByMentorUserId(requests) {
  const map = new Map();
  for (const req of requests || []) {
    if (!isOpenRequestStatus(req.status)) continue;
    const userId = req.mentorProfile?.userId ?? req.mentorProfile?.user?.id;
    if (userId == null || map.has(userId)) continue;
    map.set(userId, req);
  }
  return map;
}
