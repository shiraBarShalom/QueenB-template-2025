import axios from "axios";

/**
 * Thin client for the post-meeting feedback flow.
 *
 * Same conventions as api/menteeScheduling.js / api/notifications.js: one axios
 * instance on "/api" (CRA proxy -> :5000), unwrap the { success, data, message }
 * envelope, re-throw a plain Error carrying `.status` so callers branch on
 * 400 / 403 / 404 / 409 without importing axios.
 *
 * All state lives on the server (services/postMeetingService.js). This module
 * only calls the two post-meeting routes; it never computes status or
 * authorisation itself.
 *
 * AUTH SEAM: `actingUserId` is the current user's id from useCurrentUser(),
 * sent as a query param (GET) / body field (POST) exactly like the scheduling
 * routes. The backend checks it against the meeting's mentor / mentee.
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
 * GET /api/meetings/:meetingId/feedback?actingUserId=...
 * -> { meeting, requestStatus, role, otherPartyName, mentorName, menteeName,
 *      meetingEnded, canSubmit, alreadySubmitted, submission, reasons }
 *   403 not a participant · 404 meeting not found.
 */
export async function fetchMeetingFeedback(meetingId, actingUserId) {
  try {
    const res = await http.get(`/meetings/${meetingId}/feedback`, {
      params: { actingUserId },
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}

/**
 * POST /api/meetings/:meetingId/feedback
 * Body: { actingUserId, occurred, ... }
 *   occurred=false: { notOccurredReason, notOccurredExplanation? }
 *   occurred=true:  { rating, wasHelpful, wouldContinueMentoring? (mentee), comment? }
 * -> the same context shape, now with alreadySubmitted=true.
 *   400 validation · 403 not a participant · 404 not found ·
 *   409 meeting not ended / not open / already submitted.
 */
export async function submitMeetingFeedback(meetingId, actingUserId, answers) {
  try {
    const res = await http.post(`/meetings/${meetingId}/feedback`, {
      actingUserId,
      ...answers,
    });
    return res.data.data;
  } catch (err) {
    throw toClientError(err);
  }
}
