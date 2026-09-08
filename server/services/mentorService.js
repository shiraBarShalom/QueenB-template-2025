// ============================================================================
// Mentor business logic.
// ============================================================================
// "Becoming a mentor" = creating a MentorProfile row for an EXISTING User.
// There is deliberately no endpoint that creates a User + MentorProfile at
// once (identity creation and mentor onboarding are separate steps).
// ============================================================================

const prisma = require("../prismaClient");
const db = require("../db");
const { ApiError } = require("../utils/prismaError");
const { parseId } = require("./userService");

// Related data every mentor response carries. User identity is included but
// never its passwordHash.
// technologies = programming languages/tech stack; spokenLanguages = human languages.
const MENTOR_INCLUDE = {
  user: {
    omit: { passwordHash: true },
    include: { technologies: true, spokenLanguages: true },
  },
  mentoringTopics: true,
};

const WRITABLE_PROFILE_FIELDS = ["background", "meetingCapacity", "meetingDurationMinutes"];

function requireString(value, label) {
  if (!value || typeof value !== "string") {
    throw new ApiError(`${label} is required`, 400);
  }
  return value.trim();
}

function requirePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(`${label} must be a positive integer`, 400);
  }
  return n;
}

function optionalPositiveInt(value, label) {
  if (value === undefined) return undefined;
  return requirePositiveInt(value, label);
}

// mentoringTopics: ["Mock interviews"] -> connectOrCreate on unique name.
function topicsConnect(names) {
  if (names === undefined) return undefined;
  if (!Array.isArray(names)) {
    throw new ApiError("mentoringTopics must be an array of names", 400);
  }
  return {
    connectOrCreate: names
      .map((n) => String(n).trim())
      .filter(Boolean)
      .map((name) => ({ where: { name }, create: { name } })),
  };
}

// technologies live on the User, not the MentorProfile.
function technologiesConnect(names) {
  if (names === undefined) return undefined;
  if (!Array.isArray(names)) {
    throw new ApiError("technologies must be an array of names", 400);
  }
  return {
    connectOrCreate: names
      .map((n) => String(n).trim())
      .filter(Boolean)
      .map((name) => ({ where: { name }, create: { name } })),
  };
}

// spokenLanguages (human languages) also live on the User — separate from technologies.
function spokenLanguagesConnect(names) {
  if (names === undefined) return undefined;
  if (!Array.isArray(names)) {
    throw new ApiError("spokenLanguages must be an array of names", 400);
  }
  return {
    connectOrCreate: names
      .map((n) => String(n).trim())
      .filter(Boolean)
      .map((name) => ({ where: { name }, create: { name } })),
  };
}

// ----------------------------------------------------------------------------
// Operations
// ----------------------------------------------------------------------------
async function createMentor(body = {}) {
  const userId = parseId(body.userId, "userId");
  const background = requireString(body.background, "background");
  const meetingCapacity = requirePositiveInt(body.meetingCapacity, "meetingCapacity");
  const meetingDurationMinutes = requirePositiveInt(
    body.meetingDurationMinutes,
    "meetingDurationMinutes"
  );
  const topics = topicsConnect(body.mentoringTopics);
  const technologies = technologiesConnect(body.technologies);
  const spokenLanguages = spokenLanguagesConnect(body.spokenLanguages);

  // Friendlier errors than letting the FK / unique constraint fire raw.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { mentorProfile: true },
  });
  if (!user) throw new ApiError(`User ${userId} not found`, 404);
  if (user.mentorProfile) throw new ApiError(`User ${userId} is already a mentor`, 409);

  return prisma.$transaction(async (tx) => {
    if (technologies || spokenLanguages) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(technologies ? { technologies } : {}),
          ...(spokenLanguages ? { spokenLanguages } : {}),
        },
      });
    }
    return tx.mentorProfile.create({
      data: {
        userId,
        background,
        meetingCapacity,
        meetingDurationMinutes,
        ...(topics ? { mentoringTopics: topics } : {}),
      },
      include: MENTOR_INCLUDE,
    });
  });
}

function mentorRowToProfile(row) {
  const topics = row.advice_topics || [];
  const tech = row.technology_stack || [];
  return {
    id: Number(row.user_id),
    userId: Number(row.user_id),
    background: row.self_description || "",
    meetingCapacity: row.max_meetings,
    meetingDurationMinutes: row.meeting_duration_minutes,
    mentoringTopics: topics.map((name) => ({ name })),
    user: {
      id: Number(row.id),
      fullName: row.display_name,
      email: row.email,
      jobTitle: row.job_title,
      workplace: row.company,
      yearsOfExperience: row.years_of_experience,
      githubUrl: row.github_url,
      linkedinUrl: row.linkedin_url,
      profileImageUrl: null,
      technologies: tech.map((name) => ({ name })),
      spokenLanguages: [],
    },
  };
}

async function listMentorsFromSql() {
  const result = await db.query(
    `SELECT
       u.id, u.email, u.display_name, u.job_title, u.company,
       u.years_of_experience, u.github_url, u.linkedin_url,
       u.self_description, u.technology_stack,
       m.user_id, m.advice_topics, m.max_meetings, m.meeting_duration_minutes
     FROM mentors m
     JOIN users u ON u.id = m.user_id
     WHERE COALESCE(m.accepting_requests, TRUE) = TRUE
     ORDER BY u.display_name ASC`
  );
  return result.rows.map(mentorRowToProfile);
}

async function listMentors() {
  try {
    return await prisma.mentorProfile.findMany({
      orderBy: { id: "asc" },
      include: MENTOR_INCLUDE,
    });
  } catch {
    return listMentorsFromSql();
  }
}

async function getMentorById(rawId) {
  const id = parseId(rawId);
  return prisma.mentorProfile.findUniqueOrThrow({
    where: { id },
    include: {
      ...MENTOR_INCLUDE,
      _count: { select: { mentoringRequestsReceived: true } },
    },
  });
}

async function updateMentor(rawId, body = {}) {
  const id = parseId(rawId);

  const data = {};
  if (body.background !== undefined) data.background = requireString(body.background, "background");
  const cap = optionalPositiveInt(body.meetingCapacity, "meetingCapacity");
  if (cap !== undefined) data.meetingCapacity = cap;
  const dur = optionalPositiveInt(body.meetingDurationMinutes, "meetingDurationMinutes");
  if (dur !== undefined) data.meetingDurationMinutes = dur;

  const topics = topicsConnect(body.mentoringTopics);
  if (topics) data.mentoringTopics = topics;

  const technologies = technologiesConnect(body.technologies);
  const spokenLanguages = spokenLanguagesConnect(body.spokenLanguages);

  if (Object.keys(data).length === 0 && !technologies && !spokenLanguages) {
    throw new ApiError("No updatable fields provided", 400);
  }

  return prisma.$transaction(async (tx) => {
    // Ensure the profile exists (and get its userId) before touching relations.
    const profile = await tx.mentorProfile.findUnique({ where: { id } });
    if (!profile) throw new ApiError("Record not found", 404);

    if (technologies || spokenLanguages) {
      await tx.user.update({
        where: { id: profile.userId },
        data: {
          ...(technologies ? { technologies } : {}),
          ...(spokenLanguages ? { spokenLanguages } : {}),
        },
      });
    }

    return tx.mentorProfile.update({
      where: { id },
      data,
      include: MENTOR_INCLUDE,
    });
  });
}

module.exports = {
  createMentor,
  listMentors,
  getMentorById,
  updateMentor,
  MENTOR_INCLUDE,
};
