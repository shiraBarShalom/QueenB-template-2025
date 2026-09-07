const express = require("express");
const router = express.Router();

// ===========================================================================
// TODO (NEXT STEP): Scheduling & Meetings.
// This router is NOT mounted right now (see server/index.js) — routes/requests.js
// currently owns /api/requests. When Scheduling is implemented, build it here
// on top of the Prisma models SchedulingRound / OfferedSlot / Meeting and
// re-mount under a non-conflicting path.
// ===========================================================================

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
