/**
 * Current-user / role hook — the single identity seam for the authenticated
 * app ("/app/..." and the standalone post-meeting feedback page).
 *
 * It now reads the REAL logged-in user from AuthContext (session-backed,
 * hydrated from GET /api/users/me). The old development-only persona switch
 * (DEMO_PERSONAS + localStorage "mq.demoPersona") has been removed — identity
 * comes from the session, not a hardcoded object.
 *
 * The RETURN SHAPE is unchanged, so every consumer keeps working without edits:
 *   AppNav, NotificationBell, MenteeSchedulingSection, MenteeHomePage,
 *   MentorProfilePage, MentorAreaPage, ProposeSlotsPage, MeetingFeedbackPage.
 *
 *   {
 *     isAuthenticated,   // boolean — a session exists
 *     isMentee,          // boolean — every authenticated user may act as a mentee
 *     isMentor,          // boolean — a MentorProfile exists for this user
 *     isAdmin,           // boolean — user.isAdmin
 *     displayName,       // string | null
 *     id,                // number | null — users.id; sent as actingUserId /
 *                        //   menteeId and validated server-side against the
 *                        //   request's mentor/mentee
 *     mentorProfileId,   // number | null — reads the mentor dashboard
 *     loading,           // boolean — the /api/users/me check is still in flight
 *   }
 *
 * Role resolution follows the data model (see server/prisma/schema.prisma):
 *   - user.isAdmin              -> admin
 *   - a MentorProfile exists    -> mentor  (roles includes "MENTOR", or
 *                                           mentorProfileId is set)
 *   - otherwise                 -> mentee-only
 * A user who is BOTH keeps isMentor AND isMentee true, so both areas stay
 * reachable rather than forcing one exclusive role.
 *
 * Routes under "/app" are wrapped in <RequireAuth> (see App.js), so consumers
 * only mount once `loading` is false and `user` is known; `id` is therefore a
 * real number by the time these screens render.
 */

import { useAuth } from "../context/AuthContext";

const GUEST = Object.freeze({
  isAuthenticated: false,
  isMentee: false,
  isMentor: false,
  isAdmin: false,
  displayName: null,
  id: null,
  mentorProfileId: null,
  loading: false,
});

export function useCurrentUser() {
  const { user, loading } = useAuth();

  if (!user) {
    return loading ? { ...GUEST, loading: true } : GUEST;
  }

  const isMentor = Array.isArray(user.roles)
    ? user.roles.includes("MENTOR")
    : Boolean(user.mentorProfileId);

  return {
    isAuthenticated: true,
    isMentee: true,
    isMentor,
    isAdmin: Boolean(user.isAdmin),
    displayName: user.displayName || user.fullName || null,
    id: user.id,
    mentorProfileId: user.mentorProfileId ?? null,
    loading,
  };
}

export default useCurrentUser;
