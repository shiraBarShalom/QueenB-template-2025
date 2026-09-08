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
  ONBOARDING: "/onboarding",

  // Authenticated area
  APP: "/app", // Mentee home = mentor discovery — main page after login
  APP_PERSONAL_AREA: "/app/personal-area",
  APP_MENTOR_AREA: "/app/mentor-area",
  // Entry point for Part 3 (mentor proposes 2–3 slots for one request).
  APP_MENTOR_PROPOSE_SLOTS: "/app/mentor-area/requests/:requestId/propose-slots",
  APP_BECOME_MENTOR: "/app/become-a-mentor",
  // View / edit the signed-in mentor's own MentorProfile (reuses the same
  // form as "Become a mentor", in edit mode).
  APP_MENTOR_PROFILE_EDIT: "/app/mentor-profile",

  // Post-meeting feedback. A deliberately FOCUSED page: it renders OUTSIDE the
  // <AppLayout> nav shell (see App.js) so the user only sees the feedback task
  // she came here for. One participant (mentor or mentee) submits her own
  // response; the backend authorises her against the meeting.
  APP_MEETING_FEEDBACK: "/app/meetings/:meetingId/feedback",

  /** Mentor profile under the authenticated shell. Use mentorProfilePath(id). */
  APP_MENTOR_PROFILE: "/app/mentors/:id",

  // Legacy discovery URLs — redirected to APP routes in App.js
  LEGACY_MENTORS: "/mentors",
  LEGACY_MENTOR_PROFILE: "/mentors/:id",
};

// Build the concrete propose-slots path for a given request id.
export const mentorProposeSlotsPath = (requestId) =>
  `/app/mentor-area/requests/${requestId}/propose-slots`;

// Build the concrete post-meeting feedback path for a given meeting id.
export const meetingFeedbackPath = (meetingId) =>
  `/app/meetings/${meetingId}/feedback`;

/** Build the mentor profile path for a given user id. */
export function mentorProfilePath(id) {
  return `/app/mentors/${id}`;
}

export default ROUTES;
