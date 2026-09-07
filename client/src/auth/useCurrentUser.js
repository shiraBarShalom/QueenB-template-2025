/**
 * Placeholder current-user / role hook — the single integration seam for
 * real authentication.
 *
 * RIGHT NOW: returns a hardcoded object chosen by a DEVELOPMENT-ONLY persona
 * switch. There is no session, no API call, no token handling anywhere yet.
 *
 * LATER: implement real auth *inside this hook* (e.g. read from an AuthContext,
 * call /api/users/me, decode a token). Every consumer (AppNav, MentorAreaPage,
 * PersonalAreaPage, the future <RequireAuth>) reads the shape below and keeps
 * working unchanged.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEV PERSONA SWITCH (temporary scaffolding — delete when real auth lands)
 * ─────────────────────────────────────────────────────────────────────────────
 * Two personas map onto users created by
 * server/scripts/seed-scheduling-demo.js (fixed ids, stable across reseeds):
 *
 *   "mentor"  -> Maya Ben-David   user 9001 / MentorProfile 9101
 *                rich Mentor Area: 3 waiting-for-response, 2 awaiting mentee,
 *                2 scheduled, 1 cancelled, 1 rejected.
 *
 *   "mentee"  -> Efrat Dahan      user 9012 (no MentorProfile)
 *                Personal Area scheduling: 1 WAITING_FOR_MENTEE_SELECTION
 *                (from Dana Shapiro, 2 proposed slots) + 1 MATCHED (from Maya).
 *
 * Switch persona either way:
 *   • edit DEFAULT_PERSONA below (needs a rebuild / dev-server reload), or
 *   • in the browser console:  localStorage.setItem("mq.demoPersona", "mentee")
 *     then reload  (no rebuild; clear with localStorage.removeItem).
 *
 * `id` is the current users.id — scheduling actions send it as `actingUserId`
 * and the backend validates it against the request's mentor/mentee.
 * `mentorProfileId` (mentor persona only) just READS the mentor dashboard.
 */

const DEFAULT_PERSONA = "mentor"; // "mentor" | "mentee"
const PERSONA_STORAGE_KEY = "mq.demoPersona";

export const DEMO_PERSONAS = {
  mentor: {
    isAuthenticated: true,
    isMentee: true,
    isMentor: true,
    isAdmin: false,
    displayName: "Maya",
    id: 9001,
    mentorProfileId: 9101,
  },
  mentee: {
    isAuthenticated: true,
    isMentee: true,
    isMentor: false,
    isAdmin: false,
    displayName: "Efrat",
    id: 9012,
    mentorProfileId: null,
  },
};

function resolvePersonaKey() {
  try {
    const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    if (stored && DEMO_PERSONAS[stored]) return stored;
  } catch {
    /* localStorage unavailable — fall back to the default */
  }
  return DEMO_PERSONAS[DEFAULT_PERSONA] ? DEFAULT_PERSONA : "mentor";
}

// Kept as a named export for backwards compatibility with earlier imports.
export const PLACEHOLDER_USER = DEMO_PERSONAS[DEFAULT_PERSONA];

export function useCurrentUser() {
  // TODO(auth): replace with real session/role data. Keep the return shape.
  return DEMO_PERSONAS[resolvePersonaKey()];
}

export default useCurrentUser;
