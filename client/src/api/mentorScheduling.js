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
