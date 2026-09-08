import axios from "axios";

/**
 * Axios instance for the authentication endpoints.
 *
 * Ported from feature/mentorme-login-page. `withCredentials: true` sends the
 * `mentorme.sid` session cookie set by the server on login / register so
 * GET /api/users/me works across reloads.
 *
 * The rest of the app's API modules (api/notifications.js, api/mentorScheduling.js,
 * …) keep their own axios instances and are unaffected — only the auth calls
 * need the cookie.
 */
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export default api;
