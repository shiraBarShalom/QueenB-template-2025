// Authentication against the live SQL `users` / `mentors` tables.
// The Prisma `User` model from the pulled main branch is not present in this
// database (the app role also cannot CREATE it), so register / login / me
// read and write the existing product tables.

const db = require("../db");
const { hashPassword, verifyPassword: verifyScrypt } = require("./userService");

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

const DUMMY_SCRYPT = hashPassword("dummy-password-that-is-never-valid");

function performDummyVerification(password) {
  try {
    verifyScrypt(password, DUMMY_SCRYPT);
  } catch {
    /* ignore — only here to equalize timing */
  }
}

async function verifyStoredPassword(password, stored) {
  const hash = String(stored || "");
  if (hash.startsWith("$argon2")) {
    try {
      const argon = require("../security/passwords");
      return await argon.verifyPassword(password, hash);
    } catch {
      return false;
    }
  }
  try {
    return verifyScrypt(password, hash);
  } catch {
    return false;
  }
}

function toSafeUser(row) {
  if (!row) return null;
  const isMentor = Boolean(row.mentor_user_id);
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    fullName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    isActive: row.is_active !== false,
    onboardingComplete: Boolean(row.onboarding_complete),
    roles: ["MENTEE", ...(isMentor ? ["MENTOR"] : [])],
    mentorProfileId: isMentor ? Number(row.mentor_user_id) : null,
    createdAt: row.created_at,
    technologies: row.technology_stack || [],
    spokenLanguages: [],
    mentorProfile: isMentor
      ? {
          adviceTopics: row.advice_topics || [],
          maxMeetings: row.max_meetings,
          meetingDurationMinutes: row.meeting_duration_minutes,
          acceptingRequests: row.accepting_requests !== false,
        }
      : null,
    profile: {
      background: row.self_description || null,
      jobTitle: row.job_title || null,
      company: row.company || null,
      workplace: row.company || null,
      yearsOfExperience: row.years_of_experience ?? null,
      phoneNumber: null,
      githubUrl: row.github_url || null,
      linkedinUrl: row.linkedin_url || null,
      profileImageUrl: null,
      programmingLanguages: row.programming_languages || [],
      techStack: row.technology_stack || [],
      onboardingComplete: Boolean(row.onboarding_complete),
      meetingCapacity: row.max_meetings ?? null,
      meetingDurationMinutes: row.meeting_duration_minutes ?? null,
      mentoringTopics: row.advice_topics || [],
    },
  };
}

const USER_SELECT = `
  SELECT
    u.id, u.email, u.display_name, u.is_admin, u.is_active, u.created_at,
    u.self_description, u.job_title, u.company, u.years_of_experience,
    u.linkedin_url, u.github_url, u.programming_languages, u.technology_stack,
    u.onboarding_complete,
    m.user_id AS mentor_user_id, m.advice_topics, m.max_meetings,
    m.meeting_duration_minutes, m.accepting_requests
  FROM users u
  LEFT JOIN mentors m ON m.user_id = u.id
`;

async function getSafeUserById(id) {
  const result = await db.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return toSafeUser(result.rows[0]);
}

async function registerUser({ displayName, email, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const created = await db.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [normalizedEmail, String(displayName).trim(), hashPassword(password)]
    );
    return getSafeUserById(created.rows[0].id);
  } catch (error) {
    if (error.code === "23505") {
      throw new UserExistsError();
    }
    throw error;
  }
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await db.query(
    `SELECT id, password_hash, is_active
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [normalizedEmail]
  );
  const record = result.rows[0];

  if (!record || record.is_active === false) {
    performDummyVerification(password);
    throw new InvalidCredentialsError();
  }

  const valid = await verifyStoredPassword(password, record.password_hash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }

  return getSafeUserById(record.id);
}

async function updateAccount(userId, { displayName }) {
  await db.query(
    "UPDATE users SET display_name = $2, updated_at = NOW() WHERE id = $1",
    [userId, displayName]
  );
  return getSafeUserById(userId);
}

async function updateProfile(userId, updates) {
  const columns = {
    background: "self_description",
    linkedinUrl: "linkedin_url",
    githubUrl: "github_url",
    jobTitle: "job_title",
    company: "company",
    yearsOfExperience: "years_of_experience",
    programmingLanguages: "programming_languages",
    techStack: "technology_stack",
    onboardingComplete: "onboarding_complete",
  };
  const entries = Object.entries(updates).filter(([key]) => columns[key] !== undefined);
  if (entries.length === 0) return getSafeUserById(userId);
  const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);
  const values = entries.map(([, value]) => value);
  await db.query(
    `UPDATE users SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $1`,
    [userId, ...values]
  );
  return getSafeUserById(userId);
}

async function updateRoles(userId) {
  // Choosing "I want to mentor" only records intent. A mentors row is created
  // later, after an administrator approves the application.
  return getSafeUserById(userId);
}

async function updateMentorProfile(userId, updates) {
  const existing = await db.query("SELECT user_id FROM mentors WHERE user_id = $1", [userId]);
  if (existing.rowCount === 0) {
    const error = new Error("You are not a mentor yet");
    error.statusCode = 404;
    throw error;
  }
  const columns = {
    adviceTopics: "advice_topics",
    maxMeetings: "max_meetings",
    meetingDurationMinutes: "meeting_duration_minutes",
    acceptingRequests: "accepting_requests",
  };
  const entries = Object.entries(updates).filter(([key]) => columns[key] !== undefined);
  if (entries.length > 0) {
    const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    await db.query(
      `UPDATE mentors SET ${assignments.join(", ")}, updated_at = NOW() WHERE user_id = $1`,
      [userId, ...values]
    );
  }
  return getSafeUserById(userId);
}

module.exports = {
  UserExistsError,
  InvalidCredentialsError,
  registerUser,
  authenticateUser,
  getSafeUserById,
  toSafeUser,
  updateAccount,
  updateProfile,
  updateRoles,
  updateMentorProfile,
};
