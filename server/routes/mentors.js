const express = require("express");
const router = express.Router();

const prisma = require("../prismaClient");
const mentorService = require("../services/mentorService");
const requestService = require("../services/requestService");
const { sendSuccess, sendError } = require("../utils/responseHandler");
const { ApiError, handleError } = require("../utils/prismaError");
const { parseId } = require("../services/userService");

// Domain 2 + main mentor routes.
// Part 2 discovery/request APIs keep userId-based URLs for the existing frontend.
// Data access goes through Prisma (mentorService / requestService / prisma).

// Map Prisma MentoringRequestStatus → Part 2 MVP status names used by our client.
function toPart2Status(status) {
  switch (status) {
    case "WAITING_FOR_MENTOR_SLOTS":
      return "PENDING_MENTOR";
    case "WAITING_FOR_MENTEE_SELECTION":
      return "PENDING_MENTEE";
    case "MATCHED":
    case "ATTENDANCE_CONFIRMED":
      return "SCHEDULED";
    case "CANCELLED":
    case "REJECTED":
      return "CANCELLED";
    default:
      return status;
  }
}

// Prisma MentorProfile (+ user/topics/tech) → Part 2 list card (no email/links).
function toMentorListItem(profile) {
  const user = profile.user || {};
  const techNames = (user.technologies || []).map((t) => t.name).filter(Boolean);
  const topicNames = (profile.mentoringTopics || []).map((t) => t.name).filter(Boolean);

  return {
    userId: user.id ?? profile.userId,
    mentorProfileId: profile.id,
    username: user.fullName || null,
    jobTitle: user.jobTitle || null,
    company: user.workplace || null,
    yearsOfExperience: user.yearsOfExperience ?? null,
    techStack: techNames.length ? techNames.join(", ") : null,
    programmingLanguages: null,
    profilePictureUrl: user.profileImageUrl || null,
    background: profile.background || null,
    adviceTopics: topicNames.length ? topicNames.join(", ") : null,
    meetingDurationMins: profile.meetingDurationMinutes ?? null,
    maxMeetings: profile.meetingCapacity ?? null,
  };
}

// List shape + email / social links for the profile page.
function toMentorProfile(profile) {
  const user = profile.user || {};
  return {
    ...toMentorListItem(profile),
    email: user.email || null,
    githubUrl: user.githubUrl || null,
    linkedinUrl: user.linkedinUrl || null,
  };
}

// Part 3 / frontend handoff shape for a created or existing request.
function toMeetingRequest(request) {
  const mentorUserId =
    request.mentorProfile?.userId ??
    request.mentorProfile?.user?.id ??
    null;

  return {
    id: request.id,
    menteeId: request.menteeId,
    mentorId: mentorUserId,
    mentorProfileId: request.mentorProfileId,
    status: toPart2Status(request.status),
    createdAt: request.createdAt,
  };
}

// POST /api/mentors — an existing user becomes a mentor (from origin/main)
router.post("/", async (req, res) => {
  try {
    const mentor = await mentorService.createMentor(req.body);
    return sendSuccess(res, mentor, "Mentor profile created", 201);
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors — Part 2 list shape for Mentor List UI
router.get("/", async (req, res) => {
  try {
    const mentors = await mentorService.listMentors();
    return sendSuccess(
      res,
      mentors.map(toMentorListItem),
      "Mentors retrieved successfully"
    );
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors/:mentorId/requests/open?menteeId= — open request for this mentee+mentor pair.
// :mentorId is the mentor's USER id (same convention as POST create).
// Declared before "/:mentorProfileId/requests" so "open" is not swallowed as an id segment.
router.get("/:mentorId/requests/open", async (req, res) => {
  try {
    const mentorUserId = parseId(req.params.mentorId, "mentorId");
    const menteeId = parseId(req.query?.menteeId, "menteeId");

    const mentorProfile = await prisma.mentorProfile.findUnique({
      where: { userId: mentorUserId },
    });
    if (!mentorProfile) {
      throw new ApiError("Mentor not found", 404);
    }

    const mentee = await prisma.user.findUnique({ where: { id: menteeId } });
    if (!mentee) {
      throw new ApiError("Mentee not found", 404);
    }

    const openRequest = await requestService.findOpenRequest(
      menteeId,
      mentorProfile.id
    );

    return sendSuccess(
      res,
      openRequest ? toMeetingRequest(openRequest) : null,
      openRequest ? "Open request found" : "No open request"
    );
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors/:mentorProfileId/requests — requests received by this mentor (main)
// Declared before "/:id" and before POST "/:mentorId/requests" param siblings as needed.
router.get("/:mentorProfileId/requests", async (req, res) => {
  try {
    const requests = await requestService.listRequestsByMentorProfile(
      req.params.mentorProfileId
    );
    return sendSuccess(res, requests, "Mentor requests fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/mentors/:mentorId/requests — Part 2 create request
// :mentorId is the mentor's USER id (matches frontend /mentors/:userId).
// menteeId comes from the body until Domain 1 auth provides the logged-in user.
router.post("/:mentorId/requests", async (req, res) => {
  try {
    const mentorUserId = parseId(req.params.mentorId, "mentorId");
    const menteeId = parseId(req.body?.menteeId, "menteeId");

    if (menteeId === mentorUserId) {
      throw new ApiError("Cannot request a meeting with yourself", 400);
    }

    const mentorProfile = await prisma.mentorProfile.findUnique({
      where: { userId: mentorUserId },
      include: { user: { omit: { passwordHash: true } } },
    });
    if (!mentorProfile) {
      throw new ApiError("Mentor not found", 404);
    }

    const mentee = await prisma.user.findUnique({ where: { id: menteeId } });
    if (!mentee) {
      throw new ApiError("Mentee not found", 404);
    }

    // Duplicate open-request prevention (Part 2).
    const openRequest = await requestService.findOpenRequest(
      menteeId,
      mentorProfile.id
    );

    if (openRequest) {
      return sendError(
        res,
        "Request already sent",
        409,
        toMeetingRequest(openRequest)
      );
    }

    // Persists WAITING_FOR_MENTOR_SLOTS (Prisma enum). Mapped to PENDING_MENTOR in the response.
    const created = await requestService.createRequest({
      menteeId,
      mentorProfileId: mentorProfile.id,
    });

    return sendSuccess(
      res,
      toMeetingRequest(created),
      "Meeting request created successfully",
      201
    );
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors/:id — Part 2 profile by USER id (frontend uses /mentors/:userId)
router.get("/:id", async (req, res) => {
  try {
    const userId = parseId(req.params.id);
    const profile = await prisma.mentorProfile.findUnique({
      where: { userId },
      include: {
        ...mentorService.MENTOR_INCLUDE,
        _count: { select: { mentoringRequestsReceived: true } },
      },
    });

    if (!profile) {
      throw new ApiError("Mentor not found", 404);
    }

    return sendSuccess(res, toMentorProfile(profile), "Mentor retrieved successfully");
  } catch (err) {
    return handleError(err, res);
  }
});

// PATCH /api/mentors/:id — update by MentorProfile id (origin/main)
router.patch("/:id", async (req, res) => {
  try {
    const mentor = await mentorService.updateMentor(req.params.id, req.body);
    return sendSuccess(res, mentor, "Mentor updated");
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
