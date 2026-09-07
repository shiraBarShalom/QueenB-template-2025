// ============================================================================
// Mentor business logic.
// ============================================================================
// "Becoming a mentor" = creating a MentorProfile row for an EXISTING User.
// There is deliberately no endpoint that creates a User + MentorProfile at
// once (identity creation and mentor onboarding are separate steps).
// ============================================================================

const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");
const { parseId } = require("./userService");

// Related data every mentor response carries. User identity is included but
// never its passwordHash.
const MENTOR_INCLUDE = {
  user: {
    omit: { passwordHash: true },
    include: { technologies: true },
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

  // Friendlier errors than letting the FK / unique constraint fire raw.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { mentorProfile: true },
  });
  if (!user) throw new ApiError(`User ${userId} not found`, 404);
  if (user.mentorProfile) throw new ApiError(`User ${userId} is already a mentor`, 409);

  return prisma.$transaction(async (tx) => {
    if (technologies) {
      await tx.user.update({ where: { id: userId }, data: { technologies } });
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

async function listMentors() {
  return prisma.mentorProfile.findMany({
    orderBy: { id: "asc" },
    include: MENTOR_INCLUDE,
  });
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

  if (Object.keys(data).length === 0 && !technologies) {
    throw new ApiError("No updatable fields provided", 400);
  }

  return prisma.$transaction(async (tx) => {
    // Ensure the profile exists (and get its userId) before touching relations.
    const profile = await tx.mentorProfile.findUnique({ where: { id } });
    if (!profile) throw new ApiError("Record not found", 404);

    if (technologies) {
      await tx.user.update({ where: { id: profile.userId }, data: { technologies } });
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
