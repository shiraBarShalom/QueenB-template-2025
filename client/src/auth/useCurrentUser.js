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
 * Personas (localStorage key mq.demoPersona):
 *
 *   "mentor"  -> Maya Ben-David   user 9001 / MentorProfile 9101
 *                from seed-scheduling-demo.js (fixed ids). Rich Mentor Area.
 *
 *   "mentee"  -> Efrat Dahan      user 9012 (no MentorProfile)
 *                from seed-scheduling-demo.js. Personal Area scheduling demo.
 *
 *   "dana"    -> Dana Levi        user 2 / MentorProfile 1
 *                from prisma/seed.js (auto-increment ids on this machine).
 *                Mentor Area for the discovery-seed mentor (e.g. Shira's request).
 *
 * Switch persona either way:
 *   • edit DEFAULT_PERSONA below (needs a rebuild / dev-server reload), or
 *   • in the browser console:  localStorage.setItem("mq.demoPersona", "dana")
 *     then reload  (no rebuild; clear with localStorage.removeItem).
 *
 * `id` is the current users.id — scheduling actions send it as `actingUserId`
 * and the backend validates it against the request's mentor/mentee.
 * `mentorProfileId` (mentor personas) just READS the mentor dashboard.
 */

const DEFAULT_PERSONA = "mentor"; // "mentor" | "mentee" | "dana"
const PERSONA_STORAGE_KEY = "mq.demoPersona";

export const DEMO_PERSONAS = {
  mentor: {
    isAuthenticated: true,
    isMentee: true,
    isMentor: true,
    isAdmin: false,
    displayName: "Maya",
    id: 9011,
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
  dana: {
    isAuthenticated: true,
    isMentee: true,
    isMentor: true,
    isAdmin: false,
    displayName: "Dana",
    id: 2,
    mentorProfileId: 1,
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
