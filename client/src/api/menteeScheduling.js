import axios from "axios";

/**
 * Thin client for the mentee's scheduling section (Part 4).
 *
 * Same conventions as api/mentorScheduling.js: one axios instance on "/api"
 * (CRA proxy -> :5000), unwrap the { success, data, message } envelope, and
 * re-throw a plain Error carrying `.status` so callers can branch on
 * 400 / 403 / 404 / 409 without importing axios.
 *
 * The scheduling STATE MACHINE stays entirely on the server
 * (services/schedulingService.js). This module only calls the Part 1 routes.
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
 * GET /api/mentees/:userId/scheduling
 * -> [{ id, status, retryCount, mentor, proposal, meeting }]
 *    (only WAITING_FOR_MENTEE_SELECTION and MATCHED requests)
 */
export async function fetchMenteeScheduling(userId) {
  try {
    const res = await http.get(`/mentees/${userId}/scheduling`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/select-slot   Body: { actingUserId, offeredSlotId }
 * schedulingService.selectSlot: WAITING_FOR_MENTEE_SELECTION -> MATCHED + Meeting.
 *   403 wrong actor · 409 wrong state / slot not in current round / past / CAS.
 */
export async function selectSlot(requestId, actingUserId, offeredSlotId) {
  try {
    const res = await http.post(`/requests/${requestId}/select-slot`, {
      actingUserId,
      offeredSlotId,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/cannot-attend   Body: { actingUserId }
 * schedulingService.cannotAttend:
 *   retryCount < 2  -> WAITING_FOR_MENTOR_SLOTS, retryCount += 1
 *   retryCount == 2 -> CANCELLED (retryCount stays 2)
 *   403 wrong actor · 409 wrong state / CAS.
 */
export async function cannotAttend(requestId, actingUserId) {
  try {
    const res = await http.post(`/requests/${requestId}/cannot-attend`, {
      actingUserId,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/suggest-slots
 * Body: { actingUserId, slots: [{ startTime, endTime }, ...] }  (1-3, ISO)
 * schedulingService.suggestSlots — mentee counter-proposal: the mentor's
 * proposed times didn't fit, so the mentee offers her own instead of asking for
 * another mentor round.
 *   WAITING_FOR_MENTEE_SELECTION -> WAITING_FOR_MENTOR_SLOTS, retryCount += 1
 *   400 bad slot payload · 403 wrong actor · 409 wrong state / retry cap / CAS.
 */
export async function suggestSlots(requestId, actingUserId, slots) {
  try {
    const res = await http.post(`/requests/${requestId}/suggest-slots`, {
      actingUserId,
      slots,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/withdraw   Body: { actingUserId }
 * schedulingService.withdraw: WAITING_FOR_MENTOR_SLOTS | WAITING_FOR_MENTEE_SELECTION
 *   -> CANCELLED (terminal). 403 wrong actor · 409 wrong state / CAS.
 */
export async function withdrawRequest(requestId, actingUserId) {
  try {
    const res = await http.post(`/requests/${requestId}/withdraw`, {
      actingUserId,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/reschedule   Body: { actingUserId }
 * Part 14 — the mentee can no longer attend an already-scheduled meeting.
 * schedulingService.reschedule: MATCHED -> WAITING_FOR_MENTOR_SLOTS (once only),
 * flips the Meeting to RESCHEDULED and notifies the mentor.
 *   403 not a participant · 409 not MATCHED / already rescheduled once / CAS.
 */
export async function rescheduleRequest(requestId, actingUserId) {
  try {
    const res = await http.post(`/requests/${requestId}/reschedule`, {
      actingUserId,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/cannot-attend-meeting
 * Body: { actingUserId, reason }
 * Part 15 — the mentee cancels a scheduled meeting (reason required). Available
 * whether or not the single post-match reschedule has been used.
 * schedulingService.cannotAttendMeeting: MATCHED -> CANCELLED, Meeting ->
 * CANCELLED (with who/why/when), and the mentor is notified with the reason.
 *   400 reason missing / too short / too long · 403 not a participant ·
 *   409 not MATCHED / no scheduled meeting / CAS.
 */
export async function cannotAttendMeeting(requestId, actingUserId, reason) {
  try {
    const res = await http.post(`/requests/${requestId}/cannot-attend-meeting`, {
      actingUserId,
      reason,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}
