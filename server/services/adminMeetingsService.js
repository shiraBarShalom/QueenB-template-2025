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

function publicPerson(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.fullName,
    email: user.email,
    jobTitle: user.profile?.jobTitle || null,
    company: user.profile?.company || null,
  };
}

function latestMeeting(request) {
  if (!request.meetings?.length) return null;
  return [...request.meetings].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
}

function toReportRow(request) {
  const meeting = latestMeeting(request);
  const mentor = request.mentorProfile?.user;
  return {
    id: request.id,
    status: request.status,
    mentee: publicPerson(request.mentee),
    mentor: publicPerson(mentor),
    scheduledStart: meeting?.scheduledStart || null,
    scheduledEnd: meeting?.scheduledEnd || null,
    meetingId: meeting?.id || null,
    updatedAt: request.updatedAt,
  };
}

const REQUEST_INCLUDE = {
  mentee: { omit: { passwordHash: true }, include: { profile: true } },
  mentorProfile: {
    include: {
      user: { omit: { passwordHash: true }, include: { profile: true } },
    },
  },
  meetings: {
    orderBy: { attemptNumber: "desc" },
    include: {
      feedback: {
        include: { author: { omit: { passwordHash: true } } },
      },
    },
  },
};

function completedWhere() {
  return {
    OR: [
      { status: { in: COMPLETED_MEETING_STATUSES } },
      { request: { status: { in: COMPLETED_REQUEST_STATUSES } } },
    ],
  };
}

async function getMentoringStatsByUserIds(ids) {
  const map = {};
  for (const id of ids) {
    map[Number(id)] = { meetingsAsMentor: 0, meetingsAsMentee: 0 };
  }
  if (ids.length === 0) return map;

  const meetings = await prisma.meeting.findMany({
    where: completedWhere(),
    select: {
      request: {
        select: {
          menteeId: true,
          mentorProfile: { select: { userId: true } },
        },
      },
    },
  });

  for (const meeting of meetings) {
    const mentorId = Number(meeting.request.mentorProfile.userId);
    const menteeId = Number(meeting.request.menteeId);
    if (map[mentorId]) map[mentorId].meetingsAsMentor += 1;
    if (map[menteeId]) map[menteeId].meetingsAsMentee += 1;
  }
  return map;
}

async function getMentoringStats(userId) {
  const stats = await getMentoringStatsByUserIds([userId]);
  return stats[Number(userId)];
}

async function listReport({ status, participantId } = {}) {
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
}

async function getReportById(id) {
  const request = await prisma.mentoringRequest.findUnique({
    where: { id },
    include: REQUEST_INCLUDE,
  });
  if (!request) return null;

  const meeting = latestMeeting(request);
  const mentor = request.mentorProfile?.user;
  return {
    ...toReportRow(request),
    mentee: {
      ...publicPerson(request.mentee),
      background: request.mentee?.profile?.background || null,
    },
    mentor: {
      ...publicPerson(mentor),
      background: mentor?.profile?.background || request.mentorProfile?.background || null,
    },
    meetings: request.meetings.map((item) => ({
      id: item.id,
      attemptNumber: item.attemptNumber,
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      status: item.status,
      feedback: item.feedback.map((entry) => ({
        id: entry.id,
        authorId: entry.authorId,
        authorName: entry.author?.fullName || null,
        answers: entry.answers,
        createdAt: entry.createdAt,
      })),
    })),
    feedback: meeting
      ? meeting.feedback.map((entry) => ({
          id: entry.id,
          authorId: entry.authorId,
          authorName: entry.author?.fullName || null,
          answers: entry.answers,
          createdAt: entry.createdAt,
        }))
      : [],
  };
}

async function listCalendar() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { scheduledStart: "asc" },
    include: {
      request: { include: REQUEST_INCLUDE },
    },
  });

  return meetings.map((meeting) => ({
    id: meeting.id,
    requestId: meeting.requestId,
    status: meeting.request.status,
    scheduledStart: meeting.scheduledStart,
    scheduledEnd: meeting.scheduledEnd,
    mentee: publicPerson(meeting.request.mentee),
    mentor: publicPerson(meeting.request.mentorProfile?.user),
  }));
}

async function listAlerts() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const alerts = [];

  const requests = await prisma.mentoringRequest.findMany({
    include: REQUEST_INCLUDE,
  });
  const mentorIds = [
    ...new Set(
      requests
        .map((request) => request.mentorProfile?.userId)
        .filter(Boolean)
        .map(Number)
    ),
  ];
  const mentorStats = await getMentoringStatsByUserIds(mentorIds);

  for (const request of requests) {
    const row = toReportRow(request);
    const meeting = latestMeeting(request);

    if (request.status === "NOT_COMPLETED" || meeting?.status === "NOT_COMPLETED") {
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
    const completed =
      request.status === "COMPLETED" ||
      request.status === "FEEDBACK_COMPLETED" ||
      meeting?.status === "COMPLETED";
    if (
      completed &&
      request.status !== "FEEDBACK_COMPLETED" &&
      meetingEnded &&
      new Date(meetingEnded) < weekAgo
    ) {
      const authors = new Set((meeting?.feedback || []).map((entry) => Number(entry.authorId)));
      const participants = [
        { id: row.mentee?.id, name: row.mentee?.displayName, role: "mentee" },
        { id: row.mentor?.id, name: row.mentor?.displayName, role: "mentor" },
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
        (request) => Number(request.mentorProfile?.userId) === Number(userId)
      )?.mentorProfile?.user;
      alerts.push({
        type: "mentor_recognition",
        severity: "success",
        title: "Mentor to recognize",
        body: `${mentor?.fullName || "Mentor"} has completed ${count} mentoring meetings — more than 10.`,
        userId: Number(userId),
      });
    }
  }

  const severityOrder = { error: 0, warning: 1, success: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  return alerts;
}

async function listParticipants() {
  const users = await prisma.user.findMany({
    orderBy: { fullName: "asc" },
    omit: { passwordHash: true },
  });
  return users.map((user) => ({
    id: user.id,
    displayName: user.fullName,
    email: user.email,
  }));
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
