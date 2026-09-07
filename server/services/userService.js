// ============================================================================
// User business logic. Routes stay thin; all validation, hashing and Prisma
// access for the User model lives here.
// ============================================================================

const crypto = require("crypto");
const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");

// ----------------------------------------------------------------------------
// Password hashing (built-in crypto.scrypt — no external dependency).
// Stored format:  scrypt$<saltHex>$<derivedKeyHex>
// Swapping this for bcrypt later only touches these two functions.
// ----------------------------------------------------------------------------
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

// Kept for the future auth step; not wired to any route yet.
function verifyPassword(plain, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const derived = crypto.scryptSync(String(plain), Buffer.from(saltHex, "hex"), 64);
  return crypto.timingSafeEqual(derived, Buffer.from(keyHex, "hex"));
}

// ----------------------------------------------------------------------------
// Shared read shape: never return passwordHash, always include technologies.
// `omit` keeps every other column without having to list them one by one.
// ----------------------------------------------------------------------------
const PUBLIC_USER = {
  omit: { passwordHash: true },
  include: { technologies: true },
};

// Fields the client is allowed to set/change directly. `email`/`password` are
// handled explicitly; `isAdmin`, timestamps and relations are not user-editable
// through this MVP surface.
const WRITABLE_FIELDS = [
  "fullName",
  "jobTitle",
  "workplace",
  "yearsOfExperience",
  "profileImageUrl",
  "githubUrl",
  "linkedinUrl",
  "phoneNumber",
];

function parseId(raw, label = "id") {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(`Invalid ${label}: "${raw}"`, 400);
  }
  return id;
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

// technologies: ["React", "Node.js"] -> Prisma connectOrCreate on unique name.
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

  const data = {
    email: email.trim(),
    fullName: fullName.trim(),
    passwordHash: hashPassword(password),
    ...pick(body, WRITABLE_FIELDS),
  };

  const technologies = technologiesConnect(body.technologies);
  if (technologies) data.technologies = technologies;

  // A duplicate email surfaces as Prisma P2002 -> 409 (see utils/prismaError).
  return prisma.user.create({ data, ...PUBLIC_USER });
}

async function listUsers() {
  return prisma.user.findMany({ orderBy: { id: "asc" }, ...PUBLIC_USER });
}

async function getUserById(rawId) {
  const id = parseId(rawId);
  // findUniqueOrThrow -> P2025 -> 404 when missing.
  return prisma.user.findUniqueOrThrow({ where: { id }, ...PUBLIC_USER });
}

async function updateUser(rawId, body = {}) {
  const id = parseId(rawId);

  const data = pick(body, WRITABLE_FIELDS);

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
    data.passwordHash = hashPassword(body.password);
  }

  const technologies = technologiesConnect(body.technologies);
  if (technologies) {
    // `set: []` first would be needed to remove; for MVP we only add/keep.
    data.technologies = technologies;
  }

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
  // exported for reuse by other services / the future auth step
  hashPassword,
  verifyPassword,
  parseId,
  PUBLIC_USER,
};
