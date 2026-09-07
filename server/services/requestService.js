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
const { createNotifications } = require("./notificationService");

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
  if (mentorProfile.userId === menteeId) {
    throw new ApiError("You cannot send a mentoring request to yourself", 400);
  }

  // The request and BOTH opening notifications commit together: the mentee's
  // "your request was sent" confirmation and the mentor's actionable "new
  // request" alert exist iff the MentoringRequest row does.
  return prisma.$transaction(async (tx) => {
    const request = await tx.mentoringRequest.create({
      data: {
        menteeId,
        mentorProfileId,
        status: INITIAL_STATUS, // forced — body.status is ignored on purpose
      },
      include: REQUEST_INCLUDE,
    });

    await createNotifications(tx, [
      {
        recipientId: menteeId,
        type: "MENTORING_REQUEST_SENT",
        requestId: request.id,
        payload: { mentorName: request.mentorProfile.user.fullName },
      },
      {
        recipientId: mentorProfile.userId,
        type: "MENTORING_REQUEST_RECEIVED",
        requestId: request.id,
        payload: { menteeName: mentee.fullName },
      },
    ]);

    return request;
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
// Each dashboard section returns the actual rows behind its count, so the
// clickable summary tiles have real data to show (no separate count endpoint,
// no duplicated tallies):
//   incomingRequests          = WAITING_FOR_MENTOR_SLOTS   (actionable: propose / reject)
//   awaitingSelectionRequests = WAITING_FOR_MENTEE_SELECTION (informational: slots already sent)
//   scheduledRequests         = MATCHED                    (informational: a Meeting exists)
// Mentee identity is limited to the presentational fields agreed for a request
// card — NEVER email / phoneNumber.
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

  const [grouped, incomingRequests, awaitingRaw, scheduledRaw] = await Promise.all([
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
    prisma.mentoringRequest.findMany({
      where: { mentorProfileId, status: "WAITING_FOR_MENTEE_SELECTION" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        mentee: { select: DASHBOARD_MENTEE_SELECT },
        // The current (latest) proposal round the mentee still has to answer.
        schedulingRounds: {
          orderBy: { roundNumber: "desc" },
          take: 1,
          select: {
            roundNumber: true,
            createdAt: true,
            offeredSlots: {
              orderBy: { startTime: "asc" },
              select: { id: true, startTime: true, endTime: true },
            },
          },
        },
      },
    }),
    prisma.mentoringRequest.findMany({
      where: { mentorProfileId, status: "MATCHED" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        rescheduleAfterMatchUsed: true,
        mentee: { select: DASHBOARD_MENTEE_SELECT },
        // Latest attempt for this request.
        meetings: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
          select: {
            id: true,
            scheduledStart: true,
            scheduledEnd: true,
            status: true,
            attemptNumber: true,
          },
        },
      },
    }),
  ]);

  const countFor = (status) =>
    grouped.find((g) => g.status === status)?._count._all ?? 0;

  const awaitingSelectionRequests = awaitingRaw.map((r) => {
    const round = r.schedulingRounds[0] || null;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      mentee: r.mentee,
      proposal: round
        ? {
            roundNumber: round.roundNumber,
            proposedAt: round.createdAt,
            slots: round.offeredSlots,
          }
        : null,
    };
  });

  const scheduledRequests = scheduledRaw.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    mentee: r.mentee,
    meeting: r.meetings[0] || null,
    // Part 14: the mentor may send an already-scheduled meeting back into
    // scheduling once, when she can no longer attend the agreed time.
    canReschedule: !r.rescheduleAfterMatchUsed,
  }));

  return {
    mentorProfileId,
    counts: {
      waitingForResponse: countFor("WAITING_FOR_MENTOR_SLOTS"),
      awaitingMenteeSelection: countFor("WAITING_FOR_MENTEE_SELECTION"),
      scheduledMeetings: countFor("MATCHED"),
    },
    incomingRequests,
    awaitingSelectionRequests,
    scheduledRequests,
  };
}

// ----------------------------------------------------------------------------
// Mentee scheduling — a READ-ONLY projection for the Personal Area.
// ----------------------------------------------------------------------------
// Mirrors getMentorDashboard: no transitions, just the data the mentee's
// scheduling section needs to show BOTH:
//   * the current status of every one of her requests (Part 2 — a banner in
//     understandable words, from live backend data, not a local guess), and
//   * the actions available in the two states she can act on:
//       WAITING_FOR_MENTEE_SELECTION -> proposal (current round's 2–3 slots) + retryCount
//       MATCHED                      -> meeting (+ whether a post-match reschedule
//                                       is still available)
// `retryCount` is returned so the UI can tell the mentee whether a further
// CANNOT_ATTEND opens another round (retryCount < 2) or closes the request
// (retryCount === 2) — the button stays available either way; the copy changes.
// `canReschedule` is MATCHED && !rescheduleAfterMatchUsed (Part 14).
// Terminal REJECTED / CANCELLED rows are included but capped so the section
// still shows "what happened" without growing without bound.
// Mentor identity is limited to the presentational fields — never email/phone.
const MENTEE_SCHEDULING_STATUSES = [
  "WAITING_FOR_MENTOR_SLOTS",
  "WAITING_FOR_MENTEE_SELECTION",
  "MATCHED",
  "REJECTED",
  "CANCELLED",
];

async function getMenteeScheduling(rawUserId) {
  const menteeId = parseId(rawUserId, "userId");
  const mentee = await prisma.user.findUnique({ where: { id: menteeId } });
  if (!mentee) throw new ApiError(`User ${menteeId} not found`, 404);

  const rows = await prisma.mentoringRequest.findMany({
    where: { menteeId, status: { in: MENTEE_SCHEDULING_STATUSES } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      retryCount: true,
      rescheduleAfterMatchUsed: true,
      createdAt: true,
      updatedAt: true,
      mentorProfile: {
        select: {
          id: true,
          meetingDurationMinutes: true,
          user: { select: { fullName: true, jobTitle: true, workplace: true } },
        },
      },
      // Current (latest) proposal round the mentee has to answer.
      schedulingRounds: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        select: {
          roundNumber: true,
          type: true,
          createdAt: true,
          offeredSlots: {
            orderBy: { startTime: "asc" },
            select: { id: true, startTime: true, endTime: true },
          },
        },
      },
      // Latest attempt. For MATCHED it is the active meeting; for a request that
      // went back to scheduling after a reschedule it is the RESCHEDULED one
      // (shown as history, never as active).
      meetings: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          attemptNumber: true,
        },
      },
    },
  });

  return rows.map((r) => {
    const round = r.schedulingRounds[0] || null;
    const latestMeeting = r.meetings[0] || null;
    return {
      id: r.id,
      status: r.status,
      retryCount: r.retryCount,
      canReschedule: r.status === "MATCHED" && !r.rescheduleAfterMatchUsed,
      rescheduleAfterMatchUsed: r.rescheduleAfterMatchUsed,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      mentor: {
        fullName: r.mentorProfile.user.fullName,
        jobTitle: r.mentorProfile.user.jobTitle,
        workplace: r.mentorProfile.user.workplace,
      },
      proposal:
        r.status === "WAITING_FOR_MENTEE_SELECTION" && round
          ? {
              roundNumber: round.roundNumber,
              type: round.type,
              proposedAt: round.createdAt,
              slots: round.offeredSlots,
            }
          : null,
      meeting: r.status === "MATCHED" ? latestMeeting : null,
      // The just-superseded meeting, for a "your meeting was rescheduled" line.
      previousMeeting:
        r.status !== "MATCHED" && latestMeeting && latestMeeting.status === "RESCHEDULED"
          ? latestMeeting
          : null,
    };
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
  getMentorDashboard,
  getMenteeScheduling,
  rejectRequest,
  INITIAL_STATUS,
  REQUEST_INCLUDE,
};
