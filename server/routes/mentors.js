const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendSuccess, sendError } = require("../utils/responseHandler");

// Domain 2: Discovery & Requests — owns mentor listing + meeting_requests creation

// GET /api/mentors - list all mentors with their mentoring details
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.programming_languages,
         u.tech_stack,
         u.job_title,
         u.company,
         u.years_of_experience,
         u.profile_picture_url,
         u.github_url,
         u.linkedin_url,
         mp.id AS mentor_profile_id,
         mp.background,
         mp.advises_on,
         mp.max_meetings,
         mp.meeting_duration_minutes
       FROM users u
       INNER JOIN mentor_profiles mp ON mp.user_id = u.id
       ORDER BY u.username ASC`
    );

    return sendSuccess(res, result.rows, "Mentors retrieved successfully");
  } catch (error) {
    console.error("Error fetching mentors:", error);
    return sendError(res, "Failed to retrieve mentors", 500);
  }
});

// GET /api/mentors/:id - one mentor with user + mentor_profile details
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.programming_languages,
         u.tech_stack,
         u.job_title,
         u.company,
         u.years_of_experience,
         u.profile_picture_url,
         u.github_url,
         u.linkedin_url,
         mp.id AS mentor_profile_id,
         mp.background,
         mp.advises_on,
         mp.max_meetings,
         mp.meeting_duration_minutes
       FROM users u
       INNER JOIN mentor_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, "Mentor not found", 404);
    }

    return sendSuccess(res, result.rows[0], "Mentor retrieved successfully");
  } catch (error) {
    console.error("Error fetching mentor:", error);
    return sendError(res, "Failed to retrieve mentor", 500);
  }
});

// POST /api/mentors/:mentorId/requests - mentee requests a match with a mentor
// menteeId comes from the body until Domain 1 auth provides the logged-in user
router.post("/:mentorId/requests", async (req, res) => {
  try {
    const mentorId = Number(req.params.mentorId);
    const menteeId = Number(req.body?.menteeId);

    if (!Number.isInteger(mentorId) || mentorId <= 0) {
      return sendError(res, "Invalid mentor id", 400);
    }

    if (!Number.isInteger(menteeId) || menteeId <= 0) {
      return sendError(res, "menteeId is required", 400);
    }

    if (menteeId === mentorId) {
      return sendError(res, "Cannot request a meeting with yourself", 400);
    }

    const mentorResult = await db.query(
      `SELECT u.id
       FROM users u
       INNER JOIN mentor_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [mentorId]
    );

    if (mentorResult.rows.length === 0) {
      return sendError(res, "Mentor not found", 404);
    }

    const menteeResult = await db.query(
      `SELECT id FROM users WHERE id = $1`,
      [menteeId]
    );

    if (menteeResult.rows.length === 0) {
      return sendError(res, "Mentee not found", 404);
    }

    const insertResult = await db.query(
      `INSERT INTO meeting_requests (mentee_id, mentor_id)
       VALUES ($1, $2)
       RETURNING id, mentee_id, mentor_id, status, retry_count, created_at, updated_at`,
      [menteeId, mentorId]
    );

    return sendSuccess(
      res,
      insertResult.rows[0],
      "Meeting request created successfully",
      201
    );
  } catch (error) {
    console.error("Error creating meeting request:", error);
    return sendError(res, "Failed to create meeting request", 500);
  }
});

module.exports = router;
