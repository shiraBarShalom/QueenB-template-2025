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

  // Authenticated area (placeholder shells for now)
  APP: "/app", // Mentee Home / Mentor Search — main page after login
  APP_PERSONAL_AREA: "/app/personal-area",
  APP_MENTOR_AREA: "/app/mentor-area",
  // Entry point for Part 3 (mentor proposes 2–3 slots for one request). Only
  // the route shell exists today; the slot picker itself is Part 3.
  APP_MENTOR_PROPOSE_SLOTS: "/app/mentor-area/requests/:requestId/propose-slots",
  APP_BECOME_MENTOR: "/app/become-a-mentor",
};

// Build the concrete propose-slots path for a given request id.
export const mentorProposeSlotsPath = (requestId) =>
  `/app/mentor-area/requests/${requestId}/propose-slots`;

export default ROUTES;
