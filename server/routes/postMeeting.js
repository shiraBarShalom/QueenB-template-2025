const express = require("express");
// Mounted at "/api" (see index.js): paths hang off /api/meetings/:meetingId/...
const router = express.Router();

const postMeetingService = require("../services/postMeetingService");
const { sendSuccess } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");

// ===========================================================================
// Domain: the post-meeting flow — "did the meeting happen?" + structured
// feedback, once a Meeting's scheduled time has passed.
//
// State is 100% backend-owned (services/postMeetingService.js). The frontend
// only renders what GET returns and posts one participant's answers.
//
// AUTH SEAM: identical to routes/scheduling.js and routes/notifications.js —
// there is no session layer yet. The acting user id comes from
// `?actingUserId=` (GET) / `req.body.actingUserId` (POST); the service checks
// it against the meeting's mentee / mentor and 403s otherwise. When real auth
// lands, replace that one argument per handler with the session user id.
// ===========================================================================

// GET /api/meetings/:meetingId/feedback?actingUserId=123
// -> { meeting, role, otherPartyName, meetingEnded, canSubmit, alreadySubmitted,
//      submission, reasons }
// 400 bad id · 403 not a participant · 404 meeting not found.
router.get("/meetings/:meetingId/feedback", async (req, res) => {
  try {
    const data = await postMeetingService.getFeedbackContext(
      req.params.meetingId,
      req.query.actingUserId
    );
    return sendSuccess(res, data, "Feedback context fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/meetings/:meetingId/feedback
// Body: { actingUserId, occurred, ...(occurred=false: notOccurredReason,
//        notOccurredExplanation?) ...(occurred=true: rating, wasHelpful,
//        wouldContinueMentoring? [mentee only], comment?) }
// Records this participant's MeetingOutcomeConfirmation + Feedback rows and
// recomputes Meeting / MentoringRequest status from BOTH participants' answers.
// 400 validation · 403 not a participant · 404 meeting not found ·
// 409 meeting not ended / not open / this participant already submitted.
router.post("/meetings/:meetingId/feedback", async (req, res) => {
  try {
    const data = await postMeetingService.submitFeedback(
      req.params.meetingId,
      req.body.actingUserId,
      req.body
    );
    return sendSuccess(res, data, "Feedback submitted");
  } catch (err) {
    return handleError(err, res);
  }
});

// POST /api/meetings/:meetingId/another-meeting
// Body: { actingUserId }
// Part 2 — once BOTH participants completed feedback and BOTH said they want to
// meet again, either of them opens the next meeting. Creates a fresh
// MentoringRequest for the same (mentee, mentorProfile) pair via the existing
// scheduling flow (the Part 1 state machine is untouched). Idempotent: returns
// the already-open follow-up request if one exists.
// 400 bad id · 403 not a participant · 404 meeting not found ·
// 409 both participants have not chosen to meet again.
router.post("/meetings/:meetingId/another-meeting", async (req, res) => {
  try {
    const data = await postMeetingService.startAnotherMeeting(
      req.params.meetingId,
      req.body.actingUserId
    );
    return sendSuccess(
      res,
      data,
      data.created
        ? "Another meeting request created"
        : "A follow-up request is already open",
      data.created ? 201 : 200
    );
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
