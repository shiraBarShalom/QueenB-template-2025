/**
 * Central route table.
 *
 * LOGIN is the existing authentication page (sign-in / sign-up live in one
 * component — see pages/AuthPage.jsx). It historically lived at "/login"
 * (see git history: "Add MentorMe sign-in/sign-up page at /login").
 * The public landing page owns the root path.
 *
 * Everything under APP ("/app/...") is the authenticated area. It is
 * mounted as one layout route (components/app/AppLayout.jsx) so a real
 * auth guard can later wrap the whole subtree in one place.
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",

  // Authenticated area
  APP: "/app", // Mentor discovery / mentee home — main page after login
  APP_PERSONAL_AREA: "/app/personal-area",
  APP_MENTOR_AREA: "/app/mentor-area",
  APP_BECOME_MENTOR: "/app/become-a-mentor",
  /** Mentor profile under the authenticated shell. Use mentorProfilePath(id). */
  APP_MENTOR_PROFILE: "/app/mentors/:id",

  // Legacy discovery URLs — redirected to APP routes in App.js
  LEGACY_MENTORS: "/mentors",
  LEGACY_MENTOR_PROFILE: "/mentors/:id",
};

/** Build the mentor profile path for a given user id. */
export function mentorProfilePath(id) {
  return `/app/mentors/${id}`;
}

export default ROUTES;
