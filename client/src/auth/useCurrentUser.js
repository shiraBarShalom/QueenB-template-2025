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
  isMentor: false, // flip to true to preview the "Mentor area" navbar item
  isAdmin: false,
  displayName: "משתמשת",
};

export function useCurrentUser() {
  // TODO(auth): replace with real session/role data. Keep the return shape.
  return PLACEHOLDER_USER;
}

export default useCurrentUser;
