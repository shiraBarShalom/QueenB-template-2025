const db = require("../db");
const {
  hashPassword,
  verifyPassword,
  performDummyVerification,
} = require("../security/passwords");

class UserExistsError extends Error {}
class InvalidCredentialsError extends Error {}

function toSafeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin,
    isActive: row.is_active,
    roles: row.roles || [],
    createdAt: row.created_at,
    profile: {
      background: row.background,
      linkedinUrl: row.linkedin_url,
      githubUrl: row.github_url,
      jobTitle: row.job_title,
      company: row.company,
      yearsOfExperience: row.years_of_experience,
      programmingLanguages: row.programming_languages || [],
      techStack: row.tech_stack || [],
      onboardingComplete: row.onboarding_complete || false,
    },
    mentorProfile: row.mentor_profile_id
      ? {
          adviceTopics: row.advice_topics || [],
          maxMeetings: row.max_meetings,
          meetingDurationMinutes: row.meeting_duration_minutes,
          acceptingRequests: row.accepting_requests,
        }
      : null,
  };
}

async function getUserById(id) {
  const result = await db.query(
    `SELECT
       u.id, u.email, u.display_name, u.is_admin, u.is_active, u.created_at,
       ARRAY(SELECT role FROM user_roles WHERE user_id = u.id ORDER BY role) AS roles,
       p.background, p.linkedin_url, p.github_url, p.job_title, p.company,
       p.years_of_experience, p.programming_languages, p.tech_stack,
       p.onboarding_complete,
       m.id AS mentor_profile_id, m.advice_topics, m.max_meetings,
       m.meeting_duration_minutes, m.accepting_requests
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     LEFT JOIN mentor_profiles m ON m.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  return toSafeUser(result.rows[0]);
}

async function registerUser({ displayName, email, password }) {
  const passwordHash = await hashPassword(password);
  const client = await db.getClient();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, displayName, passwordHash]
    );
    const userId = result.rows[0].id;
    await client.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, 'MENTEE') ON CONFLICT DO NOTHING",
      [userId]
    );
    await client.query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
    await client.query("COMMIT");
    return getUserById(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new UserExistsError("An account with that email already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function authenticateUser({ email, password }) {
  const result = await db.query(
    `SELECT id, password_hash, is_active
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (result.rowCount === 0) {
    await performDummyVerification(password);
    throw new InvalidCredentialsError("Invalid email or password");
  }

  if (!result.rows[0].is_active) {
    await performDummyVerification(password);
    throw new InvalidCredentialsError("Invalid email or password");
  }

  const valid = await verifyPassword(result.rows[0].password_hash, password);
  if (!valid) {
    throw new InvalidCredentialsError("Invalid email or password");
  }
  return getUserById(result.rows[0].id);
}

async function updateAccount(userId, { displayName }) {
  await db.query(
    "UPDATE users SET display_name = $2, updated_at = NOW() WHERE id = $1",
    [userId, displayName]
  );
  return getUserById(userId);
}

async function updateRoles(userId, roles) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
    for (const role of roles) {
      await client.query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, $2)",
        [userId, role]
      );
    }
    await client.query("COMMIT");
    return getUserById(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateProfile(userId, updates) {
  const columns = {
    background: "background",
    linkedinUrl: "linkedin_url",
    githubUrl: "github_url",
    jobTitle: "job_title",
    company: "company",
    yearsOfExperience: "years_of_experience",
    programmingLanguages: "programming_languages",
    techStack: "tech_stack",
    onboardingComplete: "onboarding_complete",
  };
  const entries = Object.entries(updates).filter(([key]) => columns[key]);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(
    ([key], index) => `${columns[key]} = $${index + 2}`
  );

  await db.query(
    `INSERT INTO user_profiles (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  await db.query(
    `UPDATE user_profiles
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, ...values]
  );
  return getUserById(userId);
}

async function updateMentorProfile(userId, updates) {
  const columns = {
    adviceTopics: "advice_topics",
    maxMeetings: "max_meetings",
    meetingDurationMinutes: "meeting_duration_minutes",
    acceptingRequests: "accepting_requests",
  };
  const entries = Object.entries(updates).filter(([key]) => columns[key]);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(
    ([key], index) => `${columns[key]} = $${index + 2}`
  );

  await db.query(
    `INSERT INTO mentor_profiles (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  await db.query(
    `UPDATE mentor_profiles
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, ...values]
  );
  return getUserById(userId);
}

async function createAdmin({ displayName, email, password }) {
  const passwordHash = await hashPassword(password);
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (email, display_name, password_hash, is_admin)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (LOWER(email)) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash,
           is_admin = TRUE,
           updated_at = NOW()
       RETURNING id`,
      [email, displayName, passwordHash]
    );
    await client.query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [result.rows[0].id]
    );
    await client.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, 'MENTEE') ON CONFLICT DO NOTHING",
      [result.rows[0].id]
    );
    await client.query("COMMIT");
    return getUserById(result.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  UserExistsError,
  InvalidCredentialsError,
  registerUser,
  authenticateUser,
  getUserById,
  updateProfile,
  updateMentorProfile,
  updateAccount,
  updateRoles,
  createAdmin,
};
