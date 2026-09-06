// ============================================================================
// Mentoring request business logic.
// ============================================================================
// A MentoringRequest is a mentee's interest in one specific mentor.
//
// Status is ALWAYS assigned by the backend:
//   - on creation           -> WAITING_FOR_MENTOR_SLOTS
//   - on reject              -> REJECTED
// The client cannot pick an initial (or arbitrary) status. Everything past
// this — offering slots, matching, meetings — is the Scheduling step and is
// intentionally not implemented here.
// ============================================================================

const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");
const { parseId } = require("./userService");

const INITIAL_STATUS = "WAITING_FOR_MENTOR_SLOTS";

// States from which a reject no longer makes sense.
const UNREJECTABLE = new Set(["REJECTED", "CANCELLED", "COMPLETED", "FEEDBACK_COMPLETED"]);

// mentee + mentor identity (no passwordHash on either side).
const REQUEST_INCLUDE = {
  mentee: { omit: { passwordHash: true } },
  mentorProfile: {
    include: { user: { omit: { passwordHash: true } } },
  },
};

async function createRequest(body = {}) {
  const menteeId = parseId(body.menteeId, "menteeId");
  const mentorProfileId = parseId(body.mentorProfileId, "mentorProfileId");

  // Validate both ends exist so we can return clear 404s instead of a raw FK error.
  const [mentee, mentorProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: menteeId } }),
    prisma.mentorProfile.findUnique({ where: { id: mentorProfileId } }),
  ]);
  if (!mentee) throw new ApiError(`Mentee user ${menteeId} not found`, 404);
  if (!mentorProfile) throw new ApiError(`MentorProfile ${mentorProfileId} not found`, 404);

  return prisma.mentoringRequest.create({
    data: {
      menteeId,
      mentorProfileId,
      status: INITIAL_STATUS, // forced — body.status is ignored on purpose
    },
    include: REQUEST_INCLUDE,
  });
}

async function getRequestById(rawId) {
  const id = parseId(rawId);
  return prisma.mentoringRequest.findUniqueOrThrow({
    where: { id },
    include: REQUEST_INCLUDE,
  });
}

async function listRequestsByMentee(rawUserId) {
  const menteeId = parseId(rawUserId, "userId");
  const mentee = await prisma.user.findUnique({ where: { id: menteeId } });
  if (!mentee) throw new ApiError(`User ${menteeId} not found`, 404);

  return prisma.mentoringRequest.findMany({
    where: { menteeId },
    orderBy: { createdAt: "desc" },
    include: REQUEST_INCLUDE,
  });
}

async function listRequestsByMentorProfile(rawProfileId) {
  const mentorProfileId = parseId(rawProfileId, "mentorProfileId");
  const profile = await prisma.mentorProfile.findUnique({ where: { id: mentorProfileId } });
  if (!profile) throw new ApiError(`MentorProfile ${mentorProfileId} not found`, 404);

  return prisma.mentoringRequest.findMany({
    where: { mentorProfileId },
    orderBy: { createdAt: "desc" },
    include: REQUEST_INCLUDE,
  });
}

async function rejectRequest(rawId) {
  const id = parseId(rawId);

  const existing = await prisma.mentoringRequest.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Record not found", 404);
  if (UNREJECTABLE.has(existing.status)) {
    throw new ApiError(`Cannot reject a request in status ${existing.status}`, 409);
  }

  return prisma.mentoringRequest.update({
    where: { id },
    data: { status: "REJECTED" },
    include: REQUEST_INCLUDE,
  });
}

module.exports = {
  createRequest,
  getRequestById,
  listRequestsByMentee,
  listRequestsByMentorProfile,
  rejectRequest,
  INITIAL_STATUS,
  REQUEST_INCLUDE,
};
