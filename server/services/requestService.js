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

// ----------------------------------------------------------------------------
// Mentor dashboard — a READ-ONLY projection for the Mentor Area (Part 2).
// ----------------------------------------------------------------------------
// No transitions happen here; this only reads and counts existing rows. All
// status changes still go exclusively through schedulingService.
//
// `counts` uses ONLY definitions that follow unambiguously from a single
// MentoringRequestStatus value:
//   waitingForResponse      = WAITING_FOR_MENTOR_SLOTS   (the mentor owes a reply)
//   awaitingMenteeSelection = WAITING_FOR_MENTEE_SELECTION (slots sent, mentee to pick)
//   scheduledMeetings       = MATCHED  (a Meeting exists; MATCHED is terminal in Part 1)
//
// `incomingRequests` is the actionable queue for this Part: exactly the
// WAITING_FOR_MENTOR_SLOTS requests. Mentee identity is limited to the
// presentational fields agreed for a request card — NEVER email / phoneNumber.
const DASHBOARD_MENTEE_SELECT = {
  id: true,
  fullName: true,
  jobTitle: true,
  workplace: true,
  yearsOfExperience: true,
  profileImageUrl: true,
  technologies: { select: { id: true, name: true }, orderBy: { name: "asc" } },
};

async function getMentorDashboard(rawProfileId) {
  const mentorProfileId = parseId(rawProfileId, "mentorProfileId");
  const profile = await prisma.mentorProfile.findUnique({
    where: { id: mentorProfileId },
  });
  if (!profile) throw new ApiError(`MentorProfile ${mentorProfileId} not found`, 404);

  const [grouped, incomingRequests] = await Promise.all([
    prisma.mentoringRequest.groupBy({
      by: ["status"],
      where: { mentorProfileId },
      _count: { _all: true },
    }),
    prisma.mentoringRequest.findMany({
      where: { mentorProfileId, status: "WAITING_FOR_MENTOR_SLOTS" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        mentee: { select: DASHBOARD_MENTEE_SELECT },
      },
    }),
  ]);

  const countFor = (status) =>
    grouped.find((g) => g.status === status)?._count._all ?? 0;

  return {
    mentorProfileId,
    counts: {
      waitingForResponse: countFor("WAITING_FOR_MENTOR_SLOTS"),
      awaitingMenteeSelection: countFor("WAITING_FOR_MENTEE_SELECTION"),
      scheduledMeetings: countFor("MATCHED"),
    },
    incomingRequests,
  };
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
  getMentorDashboard,
  rejectRequest,
  INITIAL_STATUS,
  REQUEST_INCLUDE,
};
