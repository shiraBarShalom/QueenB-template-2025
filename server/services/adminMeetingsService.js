// ============================================================================
// Admin — meeting report, calendar, alerts, participant lookup.
// ============================================================================
// Adapted from origin/main's server/services/adminMeetingsService.js to THIS
// branch's Prisma schema:
//   - request.mentor (User) / request.mentorId       -> request.mentorProfile.user / mentorProfileId
//   - meeting.menteeFeedback / mentorFeedback (JSON)  -> meeting.feedback[] (Feedback rows)
//   - user.company / user.selfDescription             -> user.workplace / mentorProfile.background
// The state-machine statuses and the alert rules are unchanged.
// This module is READ-ONLY over the scheduling models.
// ============================================================================

const prisma = require("../prismaClient");

const REPORT_STATUSES = [
  "WAITING_FOR_MENTOR_SLOTS",
  "WAITING_FOR_MENTEE_SELECTION",
  "MATCHED",
  "ATTENDANCE_CONFIRMED",
  "COMPLETED",
  "NOT_COMPLETED",
  "FEEDBACK_COMPLETED",
];

const PRE_ATTENDANCE_STATUSES = [
  "WAITING_FOR_MENTOR_SLOTS",
  "WAITING_FOR_MENTEE_SELECTION",
  "MATCHED",
];

const COMPLETED_MEETING_STATUSES = ["COMPLETED"];
const COMPLETED_REQUEST_STATUSES = ["COMPLETED", "FEEDBACK_COMPLETED"];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECOGNITION_THRESHOLD = 10;

const STATUS_LABELS = {
  WAITING_FOR_MENTOR_SLOTS: "Waiting for mentor to offer times",
  WAITING_FOR_MENTEE_SELECTION: "Waiting for mentee to choose a time",
  MATCHED: "Meeting matched",
  ATTENDANCE_CONFIRMED: "Attendance confirmed",
  COMPLETED: "Meeting took place",
  NOT_COMPLETED: "Meeting did not take place",
  FEEDBACK_COMPLETED: "Feedback submitted",
};

// Prisma include that resolves both participants + meetings for a request.
// The mentor USER is reached through mentorProfile.user.
const REQUEST_INCLUDE = {
  mentee: { omit: { passwordHash: true } },
  mentorProfile: { include: { user: { omit: { passwordHash: true } } } },
  meetings: {
    orderBy: { attemptNumber: "desc" },
    include: {
      feedback: { include: { author: { select: { id: true, fullName: true } } } },
    },
  },
};

function menteeOf(request) {
  return request.mentee || null;
}
function mentorUserOf(request) {
  return request.mentorProfile ? request.mentorProfile.user : null;
}
function mentorBackgroundOf(request) {
  return request.mentorProfile ? request.mentorProfile.background || null : null;
}

function publicPerson(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.fullName,
    email: user.email,
    jobTitle: user.jobTitle || null,
    company: user.workplace || null,
  };
}

function latestMeeting(request) {
  if (!request.meetings || !request.meetings.length) return null;
  return [...request.meetings].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
}

// One Feedback row -> the shape AdminMeetingPage renders (authorName + answers).
function feedbackEntry(row) {
  const answers = {};
  if (row.occurred === false) {
    answers.occurred = false;
    if (row.notOccurredReason) answers.reason = row.notOccurredReason;
    if (row.notOccurredExplanation) answers.explanation = row.notOccurredExplanation;
  } else {
    answers.occurred = true;
    if (row.rating != null) answers.rating = row.rating;
    if (row.wasHelpful) answers.wasHelpful = row.wasHelpful;
    if (row.wouldContinueMentoring) answers.wouldContinueMentoring = row.wouldContinueMentoring;
    if (row.wantsAnotherMeeting != null) answers.wantsAnotherMeeting = row.wantsAnotherMeeting;
  }
  if (row.comment) answers.comment = row.comment;
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author ? row.author.fullName : null,
    authorRole: row.authorRole,
    answers,
  };
}

function feedbackEntries(meeting) {
  if (!meeting || !meeting.feedback) return [];
  return meeting.feedback.map(feedbackEntry);
}

function toReportRow(request) {
  const meeting = latestMeeting(request);
  return {
    id: request.id,
    status: request.status,
    mentee: publicPerson(menteeOf(request)),
    mentor: publicPerson(mentorUserOf(request)),
    scheduledStart: meeting ? meeting.scheduledStart : null,
    scheduledEnd: meeting ? meeting.scheduledEnd : null,
    meetingId: meeting ? meeting.id : null,
    updatedAt: request.updatedAt,
  };
}

function isCompletedRequest(request, meeting) {
  return (
    COMPLETED_REQUEST_STATUSES.includes(request.status) ||
    (meeting && COMPLETED_MEETING_STATUSES.includes(meeting.status))
  );
}

async function getMentoringStatsByUserIds(ids) {
  const map = {};
  for (const id of ids) {
    map[Number(id)] = { meetingsAsMentor: 0, meetingsAsMentee: 0 };
  }
  if (ids.length === 0) return map;

  const meetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { status: { in: COMPLETED_MEETING_STATUSES } },
        { request: { status: { in: COMPLETED_REQUEST_STATUSES } } },
      ],
    },
    select: {
      request: {
        select: { menteeId: true, mentorProfile: { select: { userId: true } } },
      },
    },
  });

  for (const meeting of meetings) {
    const menteeId = Number(meeting.request.menteeId);
    const mentorId = meeting.request.mentorProfile
      ? Number(meeting.request.mentorProfile.userId)
      : null;
    if (map[menteeId]) map[menteeId].meetingsAsMentee += 1;
    if (mentorId && map[mentorId]) map[mentorId].meetingsAsMentor += 1;
  }
  return map;
}

async function getMentoringStats(userId) {
  const stats = await getMentoringStatsByUserIds([userId]);
  return stats[Number(userId)] || { meetingsAsMentor: 0, meetingsAsMentee: 0 };
}

async function listReport({ status, participantId } = {}) {
  try {
  const where = {};
  if (status && REPORT_STATUSES.includes(status)) {
    where.status = status;
  }
  if (participantId) {
    where.OR = [
      { menteeId: participantId },
      { mentorProfile: { userId: participantId } },
    ];
  }

  const requests = await prisma.mentoringRequest.findMany({
    where,
    include: REQUEST_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });

  return requests.map(toReportRow);
  } catch {
    return [];
  }
}

async function getReportById(id) {
  const request = await prisma.mentoringRequest.findUnique({
    where: { id },
    include: REQUEST_INCLUDE,
  });
  if (!request) return null;

  const meeting = latestMeeting(request);
  return {
    ...toReportRow(request),
    mentee: {
      ...publicPerson(menteeOf(request)),
      background: null, // mentee background is not modelled on this branch
    },
    mentor: {
      ...publicPerson(mentorUserOf(request)),
      background: mentorBackgroundOf(request),
    },
    meetings: request.meetings.map((item) => ({
      id: item.id,
      attemptNumber: item.attemptNumber,
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      status: item.status,
      feedback: feedbackEntries(item),
    })),
    feedback: feedbackEntries(meeting),
  };
}

async function listCalendar() {
  try {
    const meetings = await prisma.meeting.findMany({
      orderBy: { scheduledStart: "asc" },
      include: { request: { include: REQUEST_INCLUDE } },
    });

    return meetings.map((meeting) => ({
      id: meeting.id,
      requestId: meeting.requestId,
      status: meeting.request.status,
      scheduledStart: meeting.scheduledStart,
      scheduledEnd: meeting.scheduledEnd,
      mentee: publicPerson(menteeOf(meeting.request)),
      mentor: publicPerson(mentorUserOf(meeting.request)),
    }));
  } catch {
    return [];
  }
}

async function listAlerts() {
  try {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const alerts = [];

  const requests = await prisma.mentoringRequest.findMany({ include: REQUEST_INCLUDE });
  const mentorIds = [
    ...new Set(
      requests
        .map((request) =>
          request.mentorProfile ? Number(request.mentorProfile.userId) : null
        )
        .filter(Boolean)
    ),
  ];
  const mentorStats = await getMentoringStatsByUserIds(mentorIds);

  for (const request of requests) {
    const row = toReportRow(request);
    const meeting = latestMeeting(request);

    if (request.status === "NOT_COMPLETED" || (meeting && meeting.status === "NOT_COMPLETED")) {
      alerts.push({
        type: "meeting_did_not_happen",
        severity: "error",
        title: "Meeting did not take place",
        body: `${row.mentee?.displayName || "Mentee"} and ${row.mentor?.displayName || "Mentor"} — this meeting was marked as not completed.`,
        requestId: request.id,
      });
    }

    if (
      meeting?.scheduledStart &&
      new Date(meeting.scheduledStart) < now &&
      PRE_ATTENDANCE_STATUSES.includes(request.status)
    ) {
      alerts.push({
        type: "meeting_time_passed",
        severity: "warning",
        title: "Scheduled time has already passed",
        body: `The status is still "${STATUS_LABELS[request.status] || request.status}" after the meeting time for ${row.mentee?.displayName || "the mentee"} and ${row.mentor?.displayName || "the mentor"}.`,
        requestId: request.id,
      });
    }

    const meetingEnded = meeting?.scheduledEnd || meeting?.scheduledStart;
    if (
      isCompletedRequest(request, meeting) &&
      request.status !== "FEEDBACK_COMPLETED" &&
      meetingEnded &&
      new Date(meetingEnded) < weekAgo
    ) {
      const authors = new Set(
        feedbackEntries(meeting).map((entry) => Number(entry.authorId))
      );
      const participants = [
        { id: row.mentee?.id, name: row.mentee?.displayName },
        { id: row.mentor?.id, name: row.mentor?.displayName },
      ];
      for (const person of participants) {
        if (!person.id || authors.has(Number(person.id))) continue;
        alerts.push({
          type: "feedback_overdue",
          severity: "warning",
          title: "Feedback missing for more than a week",
          body: `${person.name || "A participant"} has not submitted feedback for this meeting.`,
          requestId: request.id,
          userId: person.id,
        });
      }
    }
  }

  for (const userId of mentorIds) {
    const count = mentorStats[userId]?.meetingsAsMentor || 0;
    if (count > RECOGNITION_THRESHOLD) {
      const mentor = requests.find(
        (request) =>
          request.mentorProfile && Number(request.mentorProfile.userId) === Number(userId)
      );
      alerts.push({
        type: "mentor_recognition",
        severity: "success",
        title: "Mentor to recognize",
        body: `${mentorUserOf(mentor || {})?.fullName || "Mentor"} has completed ${count} mentoring meetings — more than 10.`,
        userId: Number(userId),
      });
    }
  }

  const severityOrder = { error: 0, warning: 1, success: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  return alerts;
  } catch {
    return [];
  }
}

async function listParticipants() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true },
    });
    return users.map((user) => ({
      id: user.id,
      displayName: user.fullName,
      email: user.email,
    }));
  } catch {
    return [];
  }
}

module.exports = {
  REPORT_STATUSES,
  listReport,
  getReportById,
  listCalendar,
  listAlerts,
  listParticipants,
  getMentoringStats,
  getMentoringStatsByUserIds,
};
