// ============================================================================
// Authentication business logic.
// ============================================================================
// This is the PORT of feature/mentorme-login-page's server/services/usersService.js
// onto this branch's Prisma data layer.
//
// What was kept from the incoming implementation:
//   - register / authenticate / "safe user" shape and flow
//   - constant-time-ish failure on unknown email (dummy verification) so login
//     does not leak which emails exist
//   - typed errors (UserExistsError / InvalidCredentialsError) the route maps
//     to 409 / 401
//
// What was adapted:
//   - raw `pg` queries against a bespoke users/user_profiles/user_roles schema
//     -> Prisma `user` against THIS branch's schema.prisma (unchanged)
//   - Argon2 -> the project's existing scrypt helpers in services/userService
//     (verifyPassword there was explicitly "kept for the future auth step")
//   - `roles` is DERIVED, not stored: a User is a MENTOR iff a MentorProfile
//     row exists (schema.prisma states this rule), everyone is a MENTEE. No
//     user_roles table, no schema change.
// ============================================================================

const prisma = require("../prismaClient");
const { Prisma } = require("@prisma/client");
const { hashPassword, verifyPassword } = require("./userService");

class UserExistsError extends Error {
  constructor(message = "An account with that email already exists") {
    super(message);
    this.name = "UserExistsError";
  }
}

class InvalidCredentialsError extends Error {
  constructor(message = "Invalid email or password") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

// A throwaway hash so authenticate() spends comparable CPU whether or not the
// email exists (mirrors performDummyVerification on the incoming branch).
const DUMMY_HASH = hashPassword("dummy-password-that-is-never-valid");

function performDummyVerification(password) {
  try {
    verifyPassword(password, DUMMY_HASH);
  } catch {
    /* ignore — only here to equalize timing */
  }
}

// Prisma User -> the object the client's AuthContext / AuthPage / admin pages
// consume. Never includes passwordHash.
//
// `profile` carries the editable account fields the Personal Area / "Become a
// mentor" forms prefill from. `technologies` / `spokenLanguages` are returned as
// plain name arrays (the shape the edit forms and mentor discovery already use).
// The mentor-only sub-fields (background, meetingCapacity, meetingDurationMinutes,
// mentoringTopics) are null for a mentee-only account.
function toSafeUser(user) {
  if (!user) return null;
  const isMentor = Boolean(user.mentorProfile);
  const names = (rows) => (rows || []).map((r) => r.name).filter(Boolean);
  return {
    id: user.id,
    email: user.email,
    displayName: user.fullName,
    fullName: user.fullName,
    isAdmin: user.isAdmin,
    isActive: user.isActive !== false,
    onboardingComplete: Boolean(user.onboardingComplete),
    roles: ["MENTEE", ...(isMentor ? ["MENTOR"] : [])],
    mentorProfileId: user.mentorProfile ? user.mentorProfile.id : null,
    createdAt: user.createdAt,
    technologies: names(user.technologies),
    spokenLanguages: names(user.spokenLanguages),
    profile: {
      // `background` only exists for mentors (MentorProfile.background); null
      // for a mentee-only account.
      background: user.mentorProfile ? user.mentorProfile.background || null : null,
      jobTitle: user.jobTitle || null,
      company: user.workplace || null,
      workplace: user.workplace || null,
      yearsOfExperience: user.yearsOfExperience ?? null,
      phoneNumber: user.phoneNumber || null,
      githubUrl: user.githubUrl || null,
      linkedinUrl: user.linkedinUrl || null,
      profileImageUrl: user.profileImageUrl || null,
      meetingCapacity: user.mentorProfile ? user.mentorProfile.meetingCapacity : null,
      meetingDurationMinutes: user.mentorProfile
        ? user.mentorProfile.meetingDurationMinutes
        : null,
      mentoringTopics: user.mentorProfile
        ? names(user.mentorProfile.mentoringTopics)
        : [],
    },
  };
}

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  jobTitle: true,
  workplace: true,
  yearsOfExperience: true,
  phoneNumber: true,
  githubUrl: true,
  linkedinUrl: true,
  profileImageUrl: true,
  isAdmin: true,
  isActive: true,
  onboardingComplete: true,
  createdAt: true,
  technologies: { select: { name: true }, orderBy: { name: "asc" } },
  spokenLanguages: { select: { name: true }, orderBy: { name: "asc" } },
  mentorProfile: {
    select: {
      id: true,
      background: true,
      meetingCapacity: true,
      meetingDurationMinutes: true,
      mentoringTopics: { select: { name: true }, orderBy: { name: "asc" } },
    },
  },
};

async function getSafeUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
    select: SAFE_SELECT,
  });
  return toSafeUser(user);
}

async function registerUser({ displayName, email, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        fullName: String(displayName).trim(),
        passwordHash: hashPassword(password),
      },
      select: SAFE_SELECT,
    });
    return toSafeUser(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new UserExistsError();
    }
    throw error;
  }
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const record = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, passwordHash: true, isActive: true },
  });

  // Same generic failure for "no such account" and "account disabled" — never
  // leak which one it is. Both still burn a verify to keep timing even.
  if (!record || record.isActive === false) {
    performDummyVerification(password);
    throw new InvalidCredentialsError();
  }

  let valid = false;
  try {
    valid = verifyPassword(password, record.passwordHash);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new InvalidCredentialsError();
  }

  return getSafeUserById(record.id);
}

module.exports = {
  UserExistsError,
  InvalidCredentialsError,
  registerUser,
  authenticateUser,
  getSafeUserById,
  toSafeUser,
};
