const express = require("express");
const router = express.Router();

// Domain 3: Scheduling & Statuses — owns meeting_requests status transitions + proposed_slots

// POST /api/requests/:requestId/propose-times - mentor proposes time slots
router.post("/:requestId/propose-times", (req, res) => {
  res.json({ message: `TODO: insert proposed_slots for request ${req.params.requestId}` });
});

// POST /api/requests/:requestId/select-time - mentee selects a slot
router.post("/:requestId/select-time", (req, res) => {
  res.json({ message: `TODO: mark slot selected, set status = matched for request ${req.params.requestId}` });
});

module.exports = router;
