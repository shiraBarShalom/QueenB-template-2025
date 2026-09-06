/**
 * Placeholder current-user / role hook — the single integration seam for
 * real authentication.
 *
 * RIGHT NOW: returns a hardcoded object. There is no session, no API call,
 * no token handling anywhere in the app yet.
 *
 * LATER: implement real auth *inside this hook* (e.g. read from an
 * AuthContext, call /api/users/me, decode a token). Every consumer
 * (AppNav, AppLayout, the future role redirect, a future <RequireAuth>)
 * reads this shape and keeps working unchanged.
 *
 * To preview the different navbar permutations while building UI, edit
 * PLACEHOLDER_USER below (e.g. flip isMentor to true).
 */

export const PLACEHOLDER_USER = {
  isAuthenticated: true, // assume "logged in" so the /app shells are viewable
  isMentee: true,
  isMentor: true, // flip to false to preview the "Become a mentor" navbar item
  isAdmin: false,
  displayName: "משתמשת",

  // TEMPORARY AUTH SCAFFOLDING — not a real session.
  // `id` is the current users.id. It is what scheduling actions send as
  // `actingUserId`; the backend state machine validates it against
  // request.mentorProfile.userId (see server/services/schedulingService.js).
  // `mentorProfileId` is this user's MentorProfile.id (null when !isMentor) and
  // is used only to READ the mentor dashboard. The two are different ids — do
  // not swap them. Point these at a real mentor row in your local DB to preview
  // the Mentor Area with live data. Real auth replaces all of this inside this
  // hook; consumers keep reading the same shape.
  id: 1,
  mentorProfileId: 1,
};

export function useCurrentUser() {
  // TODO(auth): replace with real session/role data. Keep the return shape.
  return PLACEHOLDER_USER;
}

export default useCurrentUser;
