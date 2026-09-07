const db = require("../db");
const { getUserById: getAccountById } = require("./usersService");
const { requestPasswordReset } = require("./passwordResetService");
const { getMentoringStats, getMentoringStatsByUserIds } = require("./adminMeetingsService");

class AdminActionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function toListUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin,
    isActive: row.is_active,
    createdAt: row.created_at,
    onboardingComplete: row.onboarding_complete,
    hasMentorProfile: row.has_mentor_profile,
    roles: row.roles || [],
    meetingsAsMentor: row.meetingsAsMentor || 0,
  };
}

async function listUsers({ page, limit, search }) {
  const offset = (page - 1) * limit;
  const pattern = `%${search}%`;
  const [users, count] = await Promise.all([
    db.query(
      `SELECT u.id, u.email, u.display_name, u.is_admin, u.is_active, u.created_at,
              p.onboarding_complete,
              EXISTS(SELECT 1 FROM mentor_profiles m WHERE m.user_id = u.id) AS has_mentor_profile,
              ARRAY(SELECT role FROM user_roles r WHERE r.user_id = u.id ORDER BY role) AS roles
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE $1 = '' OR u.email ILIKE $2 OR u.display_name ILIKE $2
       ORDER BY u.created_at DESC
       LIMIT $3 OFFSET $4`,
      [search, pattern, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE $1 = '' OR email ILIKE $2 OR display_name ILIKE $2`,
      [search, pattern]
    ),
  ]);
  const stats = await getMentoringStatsByUserIds(users.rows.map((row) => Number(row.id)));
  return {
    users: users.rows.map((row) =>
      toListUser({
        ...row,
        meetingsAsMentor: stats[Number(row.id)]?.meetingsAsMentor || 0,
      })
    ),
    total: count.rows[0].total,
    page,
    limit,
  };
}

async function getAdminStats() {
  const result = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE is_active)::int AS active,
       COUNT(*) FILTER (WHERE is_admin)::int AS admins,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = users.id AND r.role = 'MENTOR')
       )::int AS mentors
     FROM users`
  );
  return result.rows[0];
}

async function updateUserByAdmin(actorId, targetId, updates) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query(
      "SELECT id, is_admin, is_active FROM users WHERE id = $1 FOR UPDATE",
      [targetId]
    );
    if (targetResult.rowCount === 0) throw new AdminActionError("User not found", 404);
    const target = targetResult.rows[0];

    if (Number(actorId) === Number(targetId)) {
      if (updates.isAdmin === false) {
        throw new AdminActionError("You cannot remove your own administrator access");
      }
      if (updates.isActive === false) {
        throw new AdminActionError("You cannot disable your own account");
      }
    }

    if (target.is_admin && (updates.isAdmin === false || updates.isActive === false)) {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE is_admin = TRUE AND is_active = TRUE AND id <> $1`,
        [targetId]
      );
      if (admins.rows[0].count === 0) {
        throw new AdminActionError(
          updates.isActive === false
            ? "The last administrator cannot be disabled"
            : "The last administrator cannot be demoted"
        );
      }
    }

    const accountFields = [];
    const accountValues = [targetId];
    const addAccount = (column, value) => {
      accountValues.push(value);
      accountFields.push(`${column} = $${accountValues.length}`);
    };
    if (updates.displayName !== undefined) addAccount("display_name", updates.displayName);
    if (updates.email !== undefined) addAccount("email", updates.email);
    if (updates.isAdmin !== undefined) addAccount("is_admin", updates.isAdmin);
    if (updates.isActive !== undefined) {
      addAccount("is_active", updates.isActive);
      addAccount("disabled_at", updates.isActive ? null : new Date());
      addAccount("disabled_by", updates.isActive ? null : actorId);
    }
    if (accountFields.length) {
      await client.query(
        `UPDATE users SET ${accountFields.join(", ")}, updated_at = NOW() WHERE id = $1`,
        accountValues
      );
    }

    if (updates.roles) {
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [targetId]);
      for (const role of updates.roles) {
        await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [
          targetId,
          role,
        ]);
      }
    }

    if (updates.profile) {
      await client.query("INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [targetId]);
      const profileColumns = {
        background: "background",
        jobTitle: "job_title",
        company: "company",
        yearsOfExperience: "years_of_experience",
        linkedinUrl: "linkedin_url",
        githubUrl: "github_url",
        programmingLanguages: "programming_languages",
        techStack: "tech_stack",
        onboardingComplete: "onboarding_complete",
      };
      const entries = Object.entries(updates.profile);
      const values = [targetId, ...entries.map(([, value]) => value)];
      const assignments = entries.map(
        ([key], index) => `${profileColumns[key]} = $${index + 2}`
      );
      await client.query(
        `UPDATE user_profiles SET ${assignments.join(", ")}, updated_at = NOW() WHERE user_id = $1`,
        values
      );
    }

    if (updates.isActive === false) {
      await client.query("DELETE FROM user_sessions WHERE sess -> 'user' ->> 'id' = $1", [
        String(targetId),
      ]);
    }
    await client.query(
      `INSERT INTO admin_actions (actor_id, target_user_id, action, metadata)
       VALUES ($1, $2, 'USER_UPDATED', $3::jsonb)`,
      [actorId, targetId, JSON.stringify(updates)]
    );
    await client.query("COMMIT");
    return getUserById(targetId);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new AdminActionError("That email is already in use", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function revokeUserSessions(actorId, targetId) {
  const result = await db.query(
    "DELETE FROM user_sessions WHERE sess -> 'user' ->> 'id' = $1",
    [String(targetId)]
  );
  await db.query(
    `INSERT INTO admin_actions (actor_id, target_user_id, action, metadata)
     VALUES ($1, $2, 'SESSIONS_REVOKED', $3::jsonb)`,
    [actorId, targetId, JSON.stringify({ sessions: result.rowCount })]
  );
  return result.rowCount;
}

async function getUserById(id) {
  const user = await getAccountById(id);
  if (!user) return null;
  const stats = await getMentoringStats(id);
  return { ...user, ...stats };
}

async function sendUserPasswordReset(actorId, targetId, meta) {
  const user = await getAccountById(targetId);
  if (!user) throw new AdminActionError("User not found", 404);
  await requestPasswordReset({ email: user.email, ...meta });
  await db.query(
    `INSERT INTO admin_actions (actor_id, target_user_id, action)
     VALUES ($1, $2, 'PASSWORD_RESET_SENT')`,
    [actorId, targetId]
  );
}

module.exports = {
  AdminActionError,
  listUsers,
  getAdminStats,
  getUserById,
  updateUserByAdmin,
  revokeUserSessions,
  sendUserPasswordReset,
};
