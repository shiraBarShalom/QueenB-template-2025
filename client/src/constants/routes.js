/**
 * Central route table.
 *
 * LOGIN is the existing authentication page (sign-in / sign-up live in one
 * component — see pages/AuthPage.jsx). It historically lived at "/login"
 * (see git history: "Add MentorMe sign-in/sign-up page at /login").
 * The public landing page owns the root path.
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
};

export default ROUTES;
