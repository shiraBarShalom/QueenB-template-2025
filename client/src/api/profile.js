import api from "./client";

/**
 * Authenticated self-service: the mentee edits her own account, and the
 * "Become a mentor" / "Edit mentor profile" flows. All of these hit the
 * session-guarded /api/users/me* routes (server/routes/auth.js), which act on
 * the signed-in user only and delegate to the existing userService /
 * mentorService. `api` (api/client.js) already sends the session cookie.
 *
 * Every call returns the { success, data, message } envelope's `data`.
 */
const unwrap = (response) => response.data.data;

/** Drop keys whose value is `undefined` so the server never sees an empty edit. */
function compact(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out;
}

/** PATCH /api/users/me — returns the refreshed safe-user (same shape as /me). */
export const updateMyProfile = (fields) =>
  api.patch("/users/me", compact(fields)).then(unwrap);

/** POST /api/users/me/mentor-profile — become a mentor. -> { mentor, user } */
export const becomeMentor = (fields) =>
  api.post("/users/me/mentor-profile", compact(fields)).then(unwrap);

/** GET /api/users/me/mentor-profile — the signed-in mentor's own profile. */
export const getMyMentorProfile = () =>
  api.get("/users/me/mentor-profile").then(unwrap);

/** PATCH /api/users/me/mentor-profile — edit mentor details. -> { mentor, user } */
export const updateMyMentorProfile = (fields) =>
  api.patch("/users/me/mentor-profile", compact(fields)).then(unwrap);

/**
 * GET /api/mentees/:userId/requests — every request this user filed as a
 * mentee, any status. Used for the Personal Area stats (counts by the
 * scheduling state-machine status, never fabricated).
 */
export const fetchMyMenteeRequests = (userId) =>
  api.get(`/mentees/${userId}/requests`).then(unwrap);
