const express = require("express");
const router = express.Router();

const prisma = require("../prismaClient");
const mentorService = require("../services/mentorService");
const requestService = require("../services/requestService");
const schedulingService = require("../services/schedulingService");
const { sendSuccess, sendError } = require("../utils/responseHandler");
const { ApiError, handleError } = require("../utils/prismaError");
const { parseId } = require("../services/userService");

// Domain 2 (mentor discovery + request creation) + Scheduling read model.
// Discovery/request APIs keep userId-based URLs for the existing frontend.
// Data access goes through Prisma (mentorService / requestService / prisma).
// Every status transition stays in schedulingService — nothing here mutates a
// MentoringRequest status except createRequest, which only ever writes the
// forced initial WAITING_FOR_MENTOR_SLOTS.

// Map Prisma MentoringRequestStatus → Part 2 MVP status names used by our client.
// Display adapter only; the DB enum stays authoritative.
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

// Prisma MentorProfile (+ user/topics/tech/spoken languages) → Part 2 list card.
// techStack = programming languages/technologies; spokenLanguages = human languages.
// Legacy programmingLanguages stays null and is never filled with spoken languages.
function toMentorListItem(profile) {
  const user = profile.user || {};
  const techNames = (user.technologies || []).map((t) => t.name).filter(Boolean);
  const topicNames = (profile.mentoringTopics || []).map((t) => t.name).filter(Boolean);
  const spokenNames = (user.spokenLanguages || []).map((l) => l.name).filter(Boolean);

  return {
    userId: user.id ?? profile.userId,
    mentorProfileId: profile.id,
    username: user.fullName || null,
    jobTitle: user.jobTitle || null,
    company: user.workplace || null,
    yearsOfExperience: user.yearsOfExperience ?? null,
    techStack: techNames.length ? techNames.join(", ") : null,
    programmingLanguages: null,
    spokenLanguages: spokenNames,
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

// ---------------------------------------------------------------------------
// Express route ORDER matters here. Specific multi-segment paths come first so
// a literal segment ("open", "requests", "dashboard") is never swallowed as an
// ":id". Effective order:
//   POST /                              -> become a mentor
//   GET  /                              -> mentor list (discovery)
//   GET  /:mentorId/requests/open       -> open request for a mentee+mentor pair
//   GET  /:mentorProfileId/requests     -> requests received by this mentor
//   GET  /:mentorProfileId/dashboard    -> Mentor Area read model (scheduling)
//   POST /:mentorId/requests            -> create a mentoring request
//   GET  /:id                           -> single mentor profile (by user id)
//   PATCH /:id                          -> update mentoring fields
// ---------------------------------------------------------------------------

// POST /api/mentors — an existing user becomes a mentor (from origin/main)
router.post("/", async (req, res) => {
  try {
    const mentor = await mentorService.createMentor(req.body);
    return sendSuccess(res, mentor, "Mentor profile created", 201);
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors — Part 2 list shape for the Mentee Home discovery list
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

// GET /api/mentors/:mentorId/requests/open?menteeId= — open request for this
// mentee+mentor pair. :mentorId is the mentor's USER id (same convention as
// POST create). Declared before "/:mentorProfileId/requests" so "open" is not
// swallowed as an id segment.
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

// GET /api/mentors/:mentorProfileId/requests — requests received by this mentor.
// Declared before "/:id" so the more specific path wins.
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

// GET /api/mentors/:mentorProfileId/dashboard — Mentor Area read model:
// { counts, incomingRequests, awaitingSelectionRequests, scheduledRequests }
// for this mentor. Read-only projection; all scheduling transitions stay in
// schedulingService. Declared before "/:id".
router.get("/:mentorProfileId/dashboard", async (req, res) => {
  try {
    const dashboard = await requestService.getMentorDashboard(
      req.params.mentorProfileId
    );
    return sendSuccess(res, dashboard, "Mentor dashboard fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors/:mentorProfileId/busy-intervals — the mentor's upcoming
// occupied time intervals (blocking meetings only: SCHEDULED /
// ATTENDANCE_CONFIRMED, future). The propose-slots picker uses this to grey out
// taken times. Read-only; the authoritative double-booking rejection lives in
// schedulingService.proposeSlots. Declared before "/:id".
router.get("/:mentorProfileId/busy-intervals", async (req, res) => {
  try {
    const intervals = await schedulingService.getMentorBusyIntervals(
      req.params.mentorProfileId
    );
    return sendSuccess(res, intervals, "Mentor busy intervals fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/mentors/:mentorId/requests — Part 2 create request.
// :mentorId is the mentor's USER id (matches frontend /app/mentors/:userId).
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

    // Duplicate prevention lives in createRequest (shared with POST /api/requests).
    // On 409 we re-map the existing row to the Part-2 meeting-request shape so
    // the profile client keeps the same contract as before.
    try {
      const created = await requestService.createRequest({
        menteeId,
        mentorProfileId: mentorProfile.id,
      });

      // createRequest persists WAITING_FOR_MENTOR_SLOTS and writes both opening
      // notifications in one transaction. Status maps to PENDING_MENTOR for the
      // Part 2 client; the row continues through the scheduling state machine.
      return sendSuccess(
        res,
        toMeetingRequest(created),
        "Meeting request created successfully",
        201
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data) {
        return sendError(
          res,
          err.message || "Request already sent",
          409,
          toMeetingRequest(err.data)
        );
      }
      throw err;
    }
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors/:id — Part 2 profile by USER id (frontend uses /app/mentors/:userId)
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
