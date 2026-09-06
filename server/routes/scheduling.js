const express = require("express");
const router = express.Router();

const schedulingService = require("../services/schedulingService");
const { sendSuccess } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");

// ===========================================================================
// Domain: Scheduling & Statuses — the MentoringRequest state machine.
// Mounted at /api/requests (see server/index.js). Only sub-paths that do NOT
// collide with routes/requests.js are used here:
//   routes/requests.js owns:  POST /api/requests, GET /api/requests/:id,
//                             POST /api/requests/:id/reject
//   this file owns:           POST /api/requests/:requestId/propose-slots
//                             POST /api/requests/:requestId/select-slot
//                             POST /api/requests/:requestId/cannot-attend
//                             POST /api/requests/:requestId/withdraw
//                             POST /api/requests/:requestId/cancel
//
// There is deliberately NO /reject route here: mentor REJECT stays on the
// existing path POST /api/requests/:id/reject (routes/requests.js), which now
// delegates to schedulingService.reject() so it is guarded exactly like the
// actions below.
//
// AUTH SEAM: there is no session layer in the project yet. Each handler reads
// the acting user id from `req.body.actingUserId`, exactly as createRequest
// reads menteeId from the body. When real auth exists, replace that one line
// per handler with the authenticated user id; nothing else here changes.
// ===========================================================================

// POST /api/requests/:requestId/propose-slots
// Body: { actingUserId, slots: [{ startTime, endTime }, ...] }  (2 or 3 slots)
// Mentor offers times.  WAITING_FOR_MENTOR_SLOTS -> WAITING_FOR_MENTEE_SELECTION
router.post("/:requestId/propose-slots", async (req, res) => {
  try {
    const request = await schedulingService.proposeSlots(
      req.params.requestId,
      req.body.actingUserId,
      req.body.slots
    );
    return sendSuccess(res, request, "Slots proposed");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/requests/:requestId/select-slot
// Body: { actingUserId, offeredSlotId }
// Mentee locks in one offered time.  WAITING_FOR_MENTEE_SELECTION -> MATCHED
router.post("/:requestId/select-slot", async (req, res) => {
  try {
    const request = await schedulingService.selectSlot(
      req.params.requestId,
      req.body.actingUserId,
      req.body.offeredSlotId
    );
    return sendSuccess(res, request, "Slot selected");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/requests/:requestId/cannot-attend
// Body: { actingUserId }
// Mentee rejects the whole current round.
//   retryCount < 2  -> WAITING_FOR_MENTOR_SLOTS, retryCount += 1
//   retryCount == 2 -> 409 (request stays WAITING_FOR_MENTEE_SELECTION)
router.post("/:requestId/cannot-attend", async (req, res) => {
  try {
    const request = await schedulingService.cannotAttend(
      req.params.requestId,
      req.body.actingUserId
    );
    return sendSuccess(res, request, "Reported cannot attend");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/requests/:requestId/withdraw
// Body: { actingUserId }
// Mentee ends the request.  WAITING_FOR_MENTOR_SLOTS | WAITING_FOR_MENTEE_SELECTION -> CANCELLED
router.post("/:requestId/withdraw", async (req, res) => {
  try {
    const request = await schedulingService.withdraw(
      req.params.requestId,
      req.body.actingUserId
    );
    return sendSuccess(res, request, "Request withdrawn");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/requests/:requestId/cancel
// Body: { actingUserId }
// Mentor ends the request after proposing / after scheduling.
//   WAITING_FOR_MENTEE_SELECTION -> CANCELLED
//   MATCHED                      -> CANCELLED  (+ Meeting.status -> CANCELLED)
router.post("/:requestId/cancel", async (req, res) => {
  try {
    const request = await schedulingService.mentorCancel(
      req.params.requestId,
      req.body.actingUserId
    );
    return sendSuccess(res, request, "Request cancelled");
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
