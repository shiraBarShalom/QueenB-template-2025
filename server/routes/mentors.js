const express = require("express");
const router = express.Router();

// Domain 2: Discovery & Requests — owns mentor listing + meeting_requests creation

// GET /api/mentors - list all mentors with their mentoring details
router.get("/", (req, res) => {
  res.json({ message: "TODO: list mentors (join users + mentor_profiles)" });
});

// POST /api/mentors/:mentorId/requests - mentee requests a match with a mentor
router.post("/:mentorId/requests", (req, res) => {
  res.json({ message: `TODO: create meeting_request for mentor ${req.params.mentorId}` });
});

module.exports = router;
