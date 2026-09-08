// ============================================================================
// Admin — account management.
// ============================================================================
// origin/main implemented this against raw-SQL `users` / `mentors` /
// `user_sessions` tables. Here it is REIMPLEMENTED on this branch's Prisma
// models:
//   users            -> prisma.user
//   mentors          -> prisma.mentorProfile (existence == MENTOR role)
//   user_sessions    -> the connect-pg-simple `session` table via sessionPool
//   self_description  -> MentorProfile.background   (mentors only)
//   company           -> User.workplace
// Safety guards from main are preserved: an admin cannot demote/disable
// herself, and the last active admin cannot be demoted or disabled.
// ============================================================================

const prisma = require("../prismaClient");
const db = require("../db");
const { getSafeUserById } = require("./authService");
const { requestPasswordReset } = require("./passwordResetService");
const {
  getMentoringStats,
  getMentoringStatsByUserIds,
} = require("./adminMeetingsService");
const { sessionPool, sessionTableName } = require("../config/session");

class AdminActionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AdminActionError";
    this.statusCode = statusCode;
  }
}

async function deleteSessionsForUser(userId) {
  const result = await sessionPool.query(
    `DELETE FROM ${sessionTableName} WHERE sess -> 'user' ->> 'id' = $1`,
    [String(userId)]
  );
  return result.rowCount || 0;
}

function toListUser(user, meetingsAsMentor) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.fullName,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    createdAt: user.createdAt,
    onboardingComplete: user.onboardingComplete,
    hasMentorProfile: Boolean(user.mentorProfile),
    roles: ["MENTEE", ...(user.mentorProfile ? ["MENTOR"] : [])],
    meetingsAsMentor: meetingsAsMentor || 0,
  };
}

async function listUsersFromSql({ page, limit, search }) {
  const offset = (page - 1) * limit;
  const pattern = `%${search || ""}%`;
  const [users, count] = await Promise.all([
    db.query(
      `SELECT u.id, u.email, u.display_name, u.is_admin, u.is_active, u.created_at,
              u.onboarding_complete,
              EXISTS(SELECT 1 FROM mentors m WHERE m.user_id = u.id) AS has_mentor_profile
       FROM users u
       WHERE $1 = '' OR u.email ILIKE $2 OR u.display_name ILIKE $2
       ORDER BY u.created_at DESC
       LIMIT $3 OFFSET $4`,
      [search || "", pattern, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE $1 = '' OR email ILIKE $2 OR display_name ILIKE $2`,
      [search || "", pattern]
    ),
  ]);
  return {
    users: users.rows.map((row) => ({
      id: Number(row.id),
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      isActive: row.is_active,
      createdAt: row.created_at,
      onboardingComplete: row.onboarding_complete,
      hasMentorProfile: row.has_mentor_profile,
      roles: row.has_mentor_profile ? ["MENTEE", "MENTOR"] : ["MENTEE"],
      meetingsAsMentor: 0,
    })),
    total: count.rows[0].total,
    page,
    limit,
  };
}

async function listUsers({ page, limit, search }) {
  try {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          isAdmin: true,
          isActive: true,
          onboardingComplete: true,
          createdAt: true,
          mentorProfile: { select: { id: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    let stats = {};
    try {
      stats = await getMentoringStatsByUserIds(rows.map((r) => Number(r.id)));
    } catch {
      stats = {};
    }
    return {
      users: rows.map((user) =>
        toListUser(user, stats[Number(user.id)]?.meetingsAsMentor || 0)
      ),
      total,
      page,
      limit,
    };
  } catch {
    return listUsersFromSql({ page, limit, search });
  }
}

async function getAdminStats() {
  try {
    const [total, active, admins, mentors] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isAdmin: true } }),
      prisma.user.count({ where: { mentorProfile: { isNot: null } } }),
    ]);
    return { total, active, admins, mentors };
  } catch {
    const result = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE is_active)::int AS active,
         COUNT(*) FILTER (WHERE is_admin)::int AS admins,
         COUNT(*) FILTER (
           WHERE EXISTS (SELECT 1 FROM mentors m WHERE m.user_id = users.id)
         )::int AS mentors
       FROM users`
    );
    return result.rows[0];
  }
}

async function getUserById(id) {
  const user = await getSafeUserById(id);
  if (!user) return null;
  let stats = { meetingsAsMentor: 0, meetingsAsMentee: 0 };
  try {
    stats = await getMentoringStats(id);
  } catch {
    /* stats stay at zero when the Prisma meeting models are missing */
  }
  return { ...user, ...stats };
}

async function updateUserByAdmin(actorId, targetId, updates) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, isAdmin: true, isActive: true, mentorProfile: { select: { id: true } } },
  });
  if (!target) throw new AdminActionError("User not found", 404);

  // Self-protection.
  if (Number(actorId) === Number(targetId)) {
    if (updates.isAdmin === false) {
      throw new AdminActionError("You cannot remove your own administrator access");
    }
    if (updates.isActive === false) {
      throw new AdminActionError("You cannot disable your own account");
    }
  }

  // Last-admin protection.
  if (target.isAdmin && (updates.isAdmin === false || updates.isActive === false)) {
    const otherAdmins = await prisma.user.count({
      where: { isAdmin: true, isActive: true, id: { not: targetId } },
    });
    if (otherAdmins === 0) {
      throw new AdminActionError(
        updates.isActive === false
          ? "The last administrator cannot be disabled"
          : "The last administrator cannot be demoted"
      );
    }
  }

  const accountData = {};
  if (updates.displayName !== undefined) accountData.fullName = updates.displayName;
  if (updates.email !== undefined) accountData.email = updates.email;
  if (updates.isAdmin !== undefined) accountData.isAdmin = updates.isAdmin;
  if (updates.isActive !== undefined) accountData.isActive = updates.isActive;

  const profile = updates.profile || {};
  if (profile.jobTitle !== undefined) accountData.jobTitle = profile.jobTitle;
  if (profile.company !== undefined) accountData.workplace = profile.company;
  if (profile.yearsOfExperience !== undefined) {
    accountData.yearsOfExperience = profile.yearsOfExperience;
  }
  if (profile.linkedinUrl !== undefined) accountData.linkedinUrl = profile.linkedinUrl;
  if (profile.githubUrl !== undefined) accountData.githubUrl = profile.githubUrl;
  if (profile.onboardingComplete !== undefined) {
    accountData.onboardingComplete = profile.onboardingComplete;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(accountData).length) {
        await tx.user.update({ where: { id: targetId }, data: accountData });
      }

      // MENTOR role == existence of a MentorProfile row.
      if (updates.roles) {
        const wantsMentor = updates.roles.includes("MENTOR");
        if (wantsMentor && !target.mentorProfile) {
          await tx.mentorProfile.create({ data: { userId: targetId } });
        } else if (!wantsMentor && target.mentorProfile) {
          const received = await tx.mentoringRequest.count({
            where: { mentorProfileId: target.mentorProfile.id },
          });
          if (received > 0) {
            throw new AdminActionError(
              "Cannot remove the mentor role while this mentor has mentoring requests",
              409
            );
          }
          await tx.mentorProfile.delete({ where: { id: target.mentorProfile.id } });
        }
      }

      // `background` lives on MentorProfile; apply it only if the user is (or
      // just became) a mentor.
      if (profile.background !== undefined) {
        const wantsMentor = updates.roles
          ? updates.roles.includes("MENTOR")
          : Boolean(target.mentorProfile);
        if (wantsMentor) {
          await tx.mentorProfile.update({
            where: { userId: targetId },
            data: { background: profile.background || "" },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof AdminActionError) throw error;
    if (error.code === "P2002") {
      throw new AdminActionError("That email is already in use", 409);
    }
    throw error;
  }

  if (updates.isActive === false) {
    await deleteSessionsForUser(targetId);
  }

  return getUserById(targetId);
}

async function revokeUserSessions(actorId, targetId) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!user) throw new AdminActionError("User not found", 404);
  return deleteSessionsForUser(targetId);
}

async function sendUserPasswordReset(actorId, targetId, meta) {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { email: true },
  });
  if (!user) throw new AdminActionError("User not found", 404);
  await requestPasswordReset({ email: user.email, ...meta });
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
