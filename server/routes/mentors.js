const express = require("express");
const router = express.Router();

const mentorService = require("../services/mentorService");
const requestService = require("../services/requestService");
const { sendSuccess } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");

// Domain: mentor onboarding + discovery.
// "Become a mentor" = create a MentorProfile for an existing User (userId required).

// POST /api/mentors — an existing user becomes a mentor
router.post("/", async (req, res) => {
  try {
    const mentor = await mentorService.createMentor(req.body);
    return sendSuccess(res, mentor, "Mentor profile created", 201);
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors — list mentors with user + technologies + topics
router.get("/", async (req, res) => {
  try {
    const mentors = await mentorService.listMentors();
    return sendSuccess(res, mentors, "Mentors fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentors/:mentorProfileId/requests — requests received by this mentor
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

// GET /api/mentors/:mentorProfileId/dashboard — Mentor Area (Part 2) read model:
// { counts, incomingRequests } for this mentor. Read-only projection; all
// scheduling transitions stay in schedulingService. Declared before "/:id".
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

// GET /api/mentors/:id — single mentor profile + relations + request count
router.get("/:id", async (req, res) => {
  try {
    const mentor = await mentorService.getMentorById(req.params.id);
    return sendSuccess(res, mentor, "Mentor fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// PATCH /api/mentors/:id — update mentoring-specific fields
router.patch("/:id", async (req, res) => {
  try {
    const mentor = await mentorService.updateMentor(req.params.id, req.body);
    return sendSuccess(res, mentor, "Mentor updated");
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
