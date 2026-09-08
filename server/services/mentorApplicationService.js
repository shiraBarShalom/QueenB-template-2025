const fs = require("fs");
const path = require("path");
const db = require("../db");
const { getSafeUserById } = require("./authService");

const STORE = path.join(__dirname, "../data/mentor-applications.json");

class MentorApplicationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "MentorApplicationError";
  }
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

function getApplication(userId) {
  return readStore()[String(userId)] || null;
}

async function submitApplication(userId, payload = {}) {
  const user = await getSafeUserById(userId);
  if (!user) throw new MentorApplicationError("User not found", 404);
  const existingMentor = await db.query("SELECT user_id FROM mentors WHERE user_id = $1", [
    userId,
  ]);
  if (existingMentor.rowCount > 0) {
    throw new MentorApplicationError("This account is already a mentor", 409);
  }

  const all = readStore();
  all[String(userId)] = {
    userId: Number(userId),
    email: user.email,
    displayName: user.displayName,
    payload: {
      adviceTopics: payload.adviceTopics || [],
      maxMeetings: payload.maxMeetings ?? null,
      meetingDurationMinutes: payload.meetingDurationMinutes ?? null,
      acceptingRequests: payload.acceptingRequests !== false,
      background: payload.background || user.profile?.background || null,
    },
    status: "pending",
    createdAt: all[String(userId)]?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeStore(all);
  return getSafeUserById(userId);
}

function listPending() {
  return Object.values(readStore())
    .filter((row) => row.status === "pending")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function decideApplication(userId, decision, actorId) {
  if (!["approved", "rejected"].includes(decision)) {
    throw new MentorApplicationError("Invalid decision");
  }
  const all = readStore();
  const row = all[String(userId)];
  if (!row || row.status !== "pending") {
    throw new MentorApplicationError("No pending mentor application", 404);
  }

  if (decision === "approved") {
    const payload = row.payload || {};
    await db.query(
      `INSERT INTO mentors (user_id, advice_topics, max_meetings, meeting_duration_minutes, accepting_requests)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         advice_topics = EXCLUDED.advice_topics,
         max_meetings = EXCLUDED.max_meetings,
         meeting_duration_minutes = EXCLUDED.meeting_duration_minutes,
         accepting_requests = EXCLUDED.accepting_requests,
         updated_at = NOW()`,
      [
        userId,
        payload.adviceTopics || [],
        payload.maxMeetings,
        payload.meetingDurationMinutes,
        payload.acceptingRequests !== false,
      ]
    );
    if (payload.background) {
      await db.query(
        "UPDATE users SET self_description = COALESCE(self_description, $2), updated_at = NOW() WHERE id = $1",
        [userId, payload.background]
      );
    }
  }

  all[String(userId)] = {
    ...row,
    status: decision,
    decidedBy: actorId,
    updatedAt: new Date().toISOString(),
  };
  writeStore(all);
  return getSafeUserById(userId);
}

function applicationStatusFor(userId) {
  return getApplication(userId)?.status || null;
}

module.exports = {
  MentorApplicationError,
  submitApplication,
  listPending,
  decideApplication,
  applicationStatusFor,
  getApplication,
};
