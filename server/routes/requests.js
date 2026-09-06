const express = require("express");
// Mounted at "/api" (see index.js) because its routes span two resource
// prefixes: /api/requests/* and /api/mentees/:userId/requests.
const router = express.Router();

const requestService = require("../services/requestService");
const { sendSuccess } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");

// POST /api/requests — mentee sends a mentoring request.
// Body: { menteeId, mentorProfileId }. Any `status` in the body is ignored;
// the backend forces WAITING_FOR_MENTOR_SLOTS.
router.post("/requests", async (req, res) => {
  try {
    const request = await requestService.createRequest(req.body);
    return sendSuccess(res, request, "Mentoring request created", 201);
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/requests/:id — single request with mentee + mentor identity
router.get("/requests/:id", async (req, res) => {
  try {
    const request = await requestService.getRequestById(req.params.id);
    return sendSuccess(res, request, "Request fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/requests/:id/reject — mentor rejects; status -> REJECTED
router.post("/requests/:id/reject", async (req, res) => {
  try {
    const request = await requestService.rejectRequest(req.params.id);
    return sendSuccess(res, request, "Request rejected");
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/mentees/:userId/requests — requests this user filed as a mentee
router.get("/mentees/:userId/requests", async (req, res) => {
  try {
    const requests = await requestService.listRequestsByMentee(req.params.userId);
    return sendSuccess(res, requests, "Mentee requests fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
