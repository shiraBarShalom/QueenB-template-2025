import axios from "axios";

/**
 * Thin client for the Mentor Area (Part 2).
 *
 * There is no frontend API layer yet, so this is the first one: a single
 * axios instance pointed at "/api" (CRA forwards it to the server via the
 * `proxy` field in client/package.json) plus the two calls the Mentor Area
 * needs. It unwraps the server's standard `{ success, data, message }`
 * envelope and re-throws a plain Error carrying `.status` so callers can
 * branch on 409 (concurrent state change) without depending on axios.
 *
 * The scheduling STATE MACHINE stays entirely on the server
 * (services/schedulingService.js). This module only calls it.
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
 * GET /api/mentors/:mentorProfileId/dashboard
 * -> { mentorProfileId, counts, incomingRequests }
 */
export async function fetchMentorDashboard(mentorProfileId) {
  try {
    const res = await http.get(`/mentors/${mentorProfileId}/dashboard`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * GET /api/mentors/:mentorProfileId/busy-intervals
 * -> [{ meetingId, start, end }]  — the mentor's upcoming occupied intervals
 * (blocking meetings only). Lets the propose-slots picker grey out taken times.
 * The backend re-checks on submit, so this is UX only.
 */
export async function fetchMentorBusyIntervals(mentorProfileId) {
  try {
    const res = await http.get(`/mentors/${mentorProfileId}/busy-intervals`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/reject   Body: { actingUserId }
 * Delegates to schedulingService.reject on the server:
 *   403 wrong actor · 409 not WAITING_FOR_MENTOR_SLOTS / changed concurrently.
 * -> the updated request
 */
export async function rejectMentoringRequest(requestId, actingUserId) {
  try {
    const res = await http.post(`/requests/${requestId}/reject`, { actingUserId });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * GET /api/requests/:requestId
 * Used by the Propose-Slots page for context (mentee name, current status) and
 * for mentorProfile.meetingDurationMinutes, which the page needs to build each
 * slot's endTime. No new endpoint — this is the existing request read.
 * -> the request incl. { mentee, mentorProfile }
 */
export async function fetchMentoringRequest(requestId) {
  try {
    const res = await http.get(`/requests/${requestId}`);
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/propose-slots
 * Body: { actingUserId, slots: [{ startTime, endTime }, ...] }  (2 or 3, ISO)
 * Delegates to schedulingService.proposeSlots on the server:
 *   400 bad slot payload · 403 wrong actor ·
 *   404 request gone · 409 not WAITING_FOR_MENTOR_SLOTS / changed concurrently.
 * On success the request has moved to WAITING_FOR_MENTEE_SELECTION.
 * -> the updated request
 */
export async function proposeMentoringRequestSlots(requestId, actingUserId, slots) {
  try {
    const res = await http.post(`/requests/${requestId}/propose-slots`, {
      actingUserId,
      slots,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/approve-suggested-slot
 * Body: { actingUserId, offeredSlotId }
 * schedulingService.approveSuggestedSlot — the mentor accepts ONE of the
 * mentee's suggested times (current round is a mentee counter-proposal).
 * Same outcome as the mentee's select-slot: WAITING_FOR_MENTOR_SLOTS -> MATCHED,
 * exactly one Meeting created via the shared path.
 *   403 wrong actor · 409 current round is not a mentee suggestion / slot not in
 *   it / past / mentor double-booked / changed concurrently.
 */
export async function approveSuggestedSlot(requestId, actingUserId, offeredSlotId) {
  try {
    const res = await http.post(`/requests/${requestId}/approve-suggested-slot`, {
      actingUserId,
      offeredSlotId,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/reschedule   Body: { actingUserId }
 * Part 14 — the mentor can no longer attend an already-scheduled meeting.
 * schedulingService.reschedule: MATCHED -> WAITING_FOR_MENTOR_SLOTS (once only),
 * flips the Meeting to RESCHEDULED and notifies the mentee. The request then
 * reappears in "Requests awaiting your reply" for a fresh propose-slots.
 *   403 wrong actor · 409 not MATCHED / already rescheduled once / CAS.
 */
export async function rescheduleMentoringRequest(requestId, actingUserId) {
  try {
    const res = await http.post(`/requests/${requestId}/reschedule`, { actingUserId });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/requests/:requestId/cannot-attend-meeting   Body: { actingUserId, reason }
 * Part 15 — the mentor cancels a scheduled meeting (reason required). Available
 * whether or not the single post-match reschedule has been used.
 * schedulingService.cannotAttendMeeting: MATCHED -> CANCELLED, Meeting ->
 * CANCELLED (with who/why/when), and the mentee is notified with the reason.
 * NOT a reschedule.
 *   400 reason missing / too short / too long · 403 wrong actor ·
 *   409 not MATCHED / no scheduled meeting / CAS.
 */
export async function cannotAttendMeetingRequest(requestId, actingUserId, reason) {
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
