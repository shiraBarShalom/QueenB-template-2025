// ============================================================================
// User business logic. Routes stay thin; all validation, hashing and Prisma
// access for the User model lives here.
// ============================================================================

const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");
const { hashPassword } = require("../security/passwords");

// Shared read shape: never return passwordHash. Profile fields live on
// user_profiles; technologies are the normalized list used by matching.
const PUBLIC_USER = {
  omit: { passwordHash: true },
  include: { technologies: true, profile: true, roles: true },
};

const PROFILE_FIELDS = [
  "jobTitle",
  "yearsOfExperience",
  "profileImageUrl",
  "githubUrl",
  "linkedinUrl",
  "phoneNumber",
  "background",
];

function parseId(raw, label = "id") {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(`Invalid ${label}: "${raw}"`, 400);
  }
  return id;
}

function pickProfile(source) {
  const out = {};
  for (const key of PROFILE_FIELDS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  if (source.workplace !== undefined) out.company = source.workplace;
  return out;
}

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

async function createUser(body = {}) {
  const { email, password, fullName } = body;

  if (!email || typeof email !== "string") {
    throw new ApiError("email is required", 400);
  }
  if (!password || typeof password !== "string") {
    throw new ApiError("password is required", 400);
  }
  if (!fullName || typeof fullName !== "string") {
    throw new ApiError("fullName is required", 400);
  }

  const profile = pickProfile(body);
  const technologies = technologiesConnect(body.technologies);
  const data = {
    email: email.trim(),
    fullName: fullName.trim(),
    passwordHash: await hashPassword(password),
    profile: { create: profile },
    roles: { create: { role: "MENTEE" } },
  };
  if (technologies) data.technologies = technologies;

  return prisma.user.create({ data, ...PUBLIC_USER });
}

async function listUsers() {
  return prisma.user.findMany({ orderBy: { id: "asc" }, ...PUBLIC_USER });
}

async function getUserById(rawId) {
  const id = parseId(rawId);
  return prisma.user.findUniqueOrThrow({ where: { id }, ...PUBLIC_USER });
}

async function updateUser(rawId, body = {}) {
  const id = parseId(rawId);
  const data = {};

  if (body.fullName !== undefined) {
    if (!body.fullName || typeof body.fullName !== "string") {
      throw new ApiError("fullName must be a non-empty string", 400);
    }
    data.fullName = body.fullName.trim();
  }
  if (body.email !== undefined) {
    if (!body.email || typeof body.email !== "string") {
      throw new ApiError("email must be a non-empty string", 400);
    }
    data.email = body.email.trim();
  }
  if (body.password !== undefined) {
    if (!body.password || typeof body.password !== "string") {
      throw new ApiError("password must be a non-empty string", 400);
    }
    data.passwordHash = await hashPassword(body.password);
  }

  const profile = pickProfile(body);
  if (Object.keys(profile).length > 0) {
    data.profile = {
      upsert: {
        create: profile,
        update: profile,
      },
    };
  }

  const technologies = technologiesConnect(body.technologies);
  if (technologies) data.technologies = technologies;

  if (Object.keys(data).length === 0) {
    throw new ApiError("No updatable fields provided", 400);
  }

  return prisma.user.update({ where: { id }, data, ...PUBLIC_USER });
}

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  hashPassword,
  parseId,
  PUBLIC_USER,
};
