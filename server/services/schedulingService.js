// ============================================================================
// Scheduling state machine — foundation (Part 1).
// ============================================================================
// This module is the SINGLE authority for how a MentoringRequest is allowed to
// move between scheduling statuses. Routes and other services must go through
// guardTransition() + applyStatusChange() (or the per-action functions added on
// top of them); nothing else may write MentoringRequest.status / .retryCount.
//
// Vocabulary: the conceptual names from the Part 3 design doc map onto the
// EXISTING MentoringRequestStatus enum (see schema.prisma) — no new enum:
//   PENDING_MENTOR                    -> WAITING_FOR_MENTOR_SLOTS
//   PENDING_MENTEE                    -> WAITING_FOR_MENTEE_SELECTION
//   SCHEDULED                         -> MATCHED   (a Meeting row exists)
//   CANCELLED via mentor pre-proposal      -> REJECTED  (reuses requestService.rejectRequest)
//   CANCELLED via mentee withdraw          -> CANCELLED
//   CANCELLED via mentor cancel-after-propose / retry exhaustion -> CANCELLED
//
// "actingUserId" is passed in explicitly for now (there is no auth/session in
// the project yet — mirrors createRequest taking menteeId in the body). This is
// the single seam where real authentication plugs in later.
// ============================================================================

const prisma = require("../prismaClient");
const { ApiError } = require("../utils/prismaError");
const { parseId } = require("./userService");
const { REQUEST_INCLUDE } = require("./requestService");

// Subset of MentoringRequestStatus this machine reads or writes.
const STATUS = {
  WAITING_FOR_MENTOR_SLOTS: "WAITING_FOR_MENTOR_SLOTS",
  WAITING_FOR_MENTEE_SELECTION: "WAITING_FOR_MENTEE_SELECTION",
  MATCHED: "MATCHED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
};

// User intents. An action is NOT a status (CANNOT_ATTEND is a thing the mentee
// tries to do, not a state the request sits in).
const ACTION = {
  PROPOSE_SLOTS: "PROPOSE_SLOTS",
  REJECT: "REJECT",
  SELECT_SLOT: "SELECT_SLOT",
  CANNOT_ATTEND: "CANNOT_ATTEND",
  WITHDRAW: "WITHDRAW",
  CANCEL: "CANCEL",
};

// Which side of the request the caller of an action must be.
const ROLE = { MENTOR: "MENTOR", MENTEE: "MENTEE" };

// Max number of CANNOT_ATTEND retries. Confirmed product decision: at
// retryCount 2 a further CANNOT_ATTEND does NOT open a 4th round — it closes the
// request (-> CANCELLED) and retryCount stays 2.
const RETRY_LIMIT = 2;

// ----------------------------------------------------------------------------
// The transition table — the whole legal state machine in one place.
// ----------------------------------------------------------------------------
// Each row: from this status, a caller in `role` performing `action` (and
// matching `when`, if present) moves the request to `to`. `bumpsRetryCount`
// is the ONLY way retryCount ever increases.
//
// Anything not listed here is illegal by construction: unknown (action, status)
// pairs, actions from REJECTED / CANCELLED (no rows -> no outgoing transitions),
// wrong-role attempts, etc.
const TRANSITIONS = [
  // Mentor offers times.  PENDING_MENTOR + PROPOSE_SLOTS -> PENDING_MENTEE
  {
    action: ACTION.PROPOSE_SLOTS,
    from: STATUS.WAITING_FOR_MENTOR_SLOTS,
    role: ROLE.MENTOR,
    to: STATUS.WAITING_FOR_MENTEE_SELECTION,
    bumpsRetryCount: false,
  },

  // Mentor declines before offering times.  PENDING_MENTOR + REJECT -> REJECTED
  {
    action: ACTION.REJECT,
    from: STATUS.WAITING_FOR_MENTOR_SLOTS,
    role: ROLE.MENTOR,
    to: STATUS.REJECTED,
    bumpsRetryCount: false,
  },

  // Mentee abandons the request before any times exist.
  // PENDING_MENTOR + WITHDRAW -> CANCELLED. Does NOT touch retryCount.
  {
    action: ACTION.WITHDRAW,
    from: STATUS.WAITING_FOR_MENTOR_SLOTS,
    role: ROLE.MENTEE,
    to: STATUS.CANCELLED,
    bumpsRetryCount: false,
  },

  // Mentee abandons the request after times were offered: none of them work
  // AND she does not want another round.  PENDING_MENTEE + WITHDRAW -> CANCELLED.
  // Distinct from CANNOT_ATTEND: WITHDRAW ends the request and never touches
  // retryCount; CANNOT_ATTEND asks for another round (or, at the cap, also ends
  // it). Keeping both means the mentee is never forced to spend a retry just to
  // quit, or to accept a slot she cannot attend.
  {
    action: ACTION.WITHDRAW,
    from: STATUS.WAITING_FOR_MENTEE_SELECTION,
    role: ROLE.MENTEE,
    to: STATUS.CANCELLED,
    bumpsRetryCount: false,
  },

  // Mentee picks one offered slot.  PENDING_MENTEE + SELECT_SLOT -> SCHEDULED
  {
    action: ACTION.SELECT_SLOT,
    from: STATUS.WAITING_FOR_MENTEE_SELECTION,
    role: ROLE.MENTEE,
    to: STATUS.MATCHED,
    bumpsRetryCount: false,
  },

  // Mentee rejects the whole round while still under the retry limit.
  // PENDING_MENTEE + CANNOT_ATTEND [retryCount < 2] -> PENDING_MENTOR, +1 retry.
  {
    action: ACTION.CANNOT_ATTEND,
    from: STATUS.WAITING_FOR_MENTEE_SELECTION,
    role: ROLE.MENTEE,
    when: (r) => r.retryCount < RETRY_LIMIT,
    to: STATUS.WAITING_FOR_MENTOR_SLOTS,
    bumpsRetryCount: true,
  },

  // Retry limit reached: a further CANNOT_ATTEND closes the request.
  // PENDING_MENTEE + CANNOT_ATTEND [retryCount == 2] -> CANCELLED, retryCount stays 2.
  {
    action: ACTION.CANNOT_ATTEND,
    from: STATUS.WAITING_FOR_MENTEE_SELECTION,
    role: ROLE.MENTEE,
    when: (r) => r.retryCount >= RETRY_LIMIT,
    to: STATUS.CANCELLED,
    bumpsRetryCount: false,
  },

  // Mentor cancels after offering times (e.g. a volunteer becomes unavailable).
  // PENDING_MENTEE + Mentor CANCEL -> CANCELLED
  {
    action: ACTION.CANCEL,
    from: STATUS.WAITING_FOR_MENTEE_SELECTION,
    role: ROLE.MENTOR,
    to: STATUS.CANCELLED,
    bumpsRetryCount: false,
  },

  // Mentor cancels after a meeting was scheduled. MATCHED is NOT terminal for
  // this one transition; mentorCancel also flips the Meeting row to CANCELLED in
  // the same transaction.  MATCHED + Mentor CANCEL -> CANCELLED
  {
    action: ACTION.CANCEL,
    from: STATUS.MATCHED,
    role: ROLE.MENTOR,
    to: STATUS.CANCELLED,
    bumpsRetryCount: false,
  },
];

// ----------------------------------------------------------------------------
// guardTransition — read-only legality check. Writes nothing.
// ----------------------------------------------------------------------------
// Returns { request, transition } when `action` by `actingUserId` is legal on
// the request RIGHT NOW; otherwise throws ApiError. Checks run in this order so
// a failed check never leaks details the caller was not entitled to reach:
//
//   400  invalid id / unknown action
//   404  request does not exist                       (not found)
//   409  action undefined for the current status      (illegal transition)
//   403  caller is not the mentor/mentee it requires  (wrong actor)
//   409  status matches but no condition branch does  (normally unreachable —
//        the two CANNOT_ATTEND rows together cover every retryCount; a safety
//        net for future table edits)
async function guardTransition(rawRequestId, action, rawActingUserId) {
  const requestId = parseId(rawRequestId, "requestId");
  const actingUserId = parseId(rawActingUserId, "actingUserId");

  if (!Object.values(ACTION).includes(action)) {
    throw new ApiError(`Unknown scheduling action: "${action}"`, 400);
  }

  const request = await prisma.mentoringRequest.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE,
  });
  if (!request) throw new ApiError(`MentoringRequest ${requestId} not found`, 404);

  // Invariant I3: a request has two distinct people. Creation SHOULD reject a
  // self-request (requestService, a Part 2 concern), but if a bad row exists we
  // must not let one user satisfy BOTH the mentor and mentee actor checks.
  if (request.mentorProfile.userId === request.menteeId) {
    throw new ApiError(
      `Request ${requestId} is invalid: mentor and mentee are the same user`,
      409
    );
  }

  const candidates = TRANSITIONS.filter(
    (t) => t.action === action && t.from === request.status
  );
  if (candidates.length === 0) {
    throw new ApiError(
      `Action ${action} is not allowed while request ${requestId} is ${request.status}`,
      409
    );
  }

  // Role is fixed per (action, from), so every candidate shares it — safe to
  // read from the first and check the actor before evaluating any condition.
  const requiredRole = candidates[0].role;
  const actualActorId =
    requiredRole === ROLE.MENTOR
      ? request.mentorProfile.userId
      : request.menteeId;
  if (actingUserId !== actualActorId) {
    throw new ApiError(
      `User ${actingUserId} is not the ${requiredRole.toLowerCase()} of request ${requestId}`,
      403
    );
  }

  const transition = candidates.find((t) => !t.when || t.when(request));
  if (!transition) {
    throw new ApiError(
      `Action ${action} has no matching rule for request ${requestId} in its current condition`,
      409
    );
  }

  return { request, transition };
}

// ----------------------------------------------------------------------------
// applyStatusChange — the atomic core of every transition.
// ----------------------------------------------------------------------------
// Flips status (and increments retryCount when the transition says so) ONLY IF
// the row still holds the (status, retryCount) that guardTransition validated
// against. Must be called inside a prisma interactive transaction (`tx`),
// together with that action's other writes (creating a SchedulingRound,
// a Meeting, superseding slots, ...), so the whole action is all-or-nothing.
//
// Throws ApiError(409) when the row moved under us: a concurrent action already
// left this state and this caller lost the race. Because the WHERE clause pins
// both status and retryCount, two actions that observed the same starting point
// can never both succeed.
async function applyStatusChange(tx, request, transition) {
  const data = { status: transition.to };
  if (transition.bumpsRetryCount) data.retryCount = { increment: 1 };

  const { count } = await tx.mentoringRequest.updateMany({
    where: {
      id: request.id,
      status: request.status,
      retryCount: request.retryCount,
    },
    data,
  });

  if (count !== 1) {
    throw new ApiError(
      `Request ${request.id} changed state concurrently; the action was not applied`,
      409
    );
  }
}

// ----------------------------------------------------------------------------
// runAction — the shared shape of every write-side action.
// ----------------------------------------------------------------------------
//   1. guardTransition: is this action, by this user, legal right now? (no writes)
//   2. one interactive transaction:
//        a. applyStatusChange — the (status, retryCount) compare-and-set: wins
//           the race or throws 409.
//        b. sideEffect (optional) — this action's related writes (a
//           SchedulingRound + OfferedSlots, a Meeting, a Meeting cancellation).
//           Anything it throws rolls the WHOLE transaction back, the status
//           change included: the action is all-or-nothing.
//        c. re-read the request in the standard REQUEST_INCLUDE shape.
//
// `request` handed to sideEffect is the pre-transition snapshot from step 1 —
// its .status / .retryCount are exactly what the CAS pinned to.
async function runAction(rawRequestId, action, rawActingUserId, sideEffect) {
  const { request, transition } = await guardTransition(
    rawRequestId,
    action,
    rawActingUserId
  );

  return prisma.$transaction(async (tx) => {
    await applyStatusChange(tx, request, transition);
    if (sideEffect) await sideEffect(tx, request, transition);
    return tx.mentoringRequest.findUnique({
      where: { id: request.id },
      include: REQUEST_INCLUDE,
    });
  });
}

// ----------------------------------------------------------------------------
// Status-only actions — no related writes, just the guarded transition.
// ----------------------------------------------------------------------------

// PENDING_MENTOR + Mentor REJECT -> REJECTED.
// NOT HTTP-exposed in Part 1: the existing POST /api/requests/:id/reject still
// routes to requestService.rejectRequest, left untouched per decision C. Kept
// here so this module owns every row in the table and so it is testable now.
function reject(requestId, actingUserId) {
  return runAction(requestId, ACTION.REJECT, actingUserId);
}

// PENDING_MENTOR + Mentee WITHDRAW -> CANCELLED
// PENDING_MENTEE + Mentee WITHDRAW -> CANCELLED
// Same action, two legal from-states; guardTransition matches the right row.
// Never touches retryCount.
function withdraw(requestId, actingUserId) {
  return runAction(requestId, ACTION.WITHDRAW, actingUserId);
}

// PENDING_MENTEE + Mentee CANNOT_ATTEND. Outcome chosen by guardTransition from
// retryCount:
//   retryCount < 2  -> PENDING_MENTOR, retryCount += 1  (mentor owes another round)
//   retryCount == 2 -> CANCELLED,      retryCount stays 2 (confirmed: no 4th round)
// applyStatusChange does the +1 only for the row whose bumpsRetryCount is true.
// No side writes: the just-rejected round's slots stop being selectable
// structurally (the next PROPOSE_SLOTS creates a higher-numbered round).
function cannotAttend(requestId, actingUserId) {
  return runAction(requestId, ACTION.CANNOT_ATTEND, actingUserId);
}

// ----------------------------------------------------------------------------
// PROPOSE_SLOTS — mentor offers times for the current round.
// ----------------------------------------------------------------------------

// Min/max slots a proposal round may contain. Confirmed product rule: a mentor
// offers 2 or 3 times — never 1, never 4+. An out-of-range list is REJECTED,
// never silently clamped.
const MIN_SLOTS_PER_ROUND = 2;
const MAX_SLOTS_PER_ROUND = 3;

// Validate the raw slot payload for PROPOSE_SLOTS. Enforces every rule the
// state machine relies on for the PENDING_MENTEE invariant:
//   - the list has exactly 2 or 3 entries
//   - each entry has parseable startTime / endTime
//   - endTime is after startTime
//   - startTime is still in the future (a round of already-past times could
//     never satisfy "PENDING_MENTEE has a selectable slot")
// `now` is injected so the same clock is used across the whole action.
function normalizeSlots(raw, now) {
  if (!Array.isArray(raw)) {
    throw new ApiError("slots must be an array of { startTime, endTime }", 400);
  }
  if (raw.length < MIN_SLOTS_PER_ROUND || raw.length > MAX_SLOTS_PER_ROUND) {
    throw new ApiError(
      `A proposal must contain exactly ${MIN_SLOTS_PER_ROUND}-${MAX_SLOTS_PER_ROUND} slots (got ${raw.length})`,
      400
    );
  }
  return raw.map((slot, i) => {
    const startTime = new Date(slot && slot.startTime);
    const endTime = new Date(slot && slot.endTime);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new ApiError(
        `slots[${i}]: startTime and endTime must be valid date strings`,
        400
      );
    }
    if (endTime <= startTime) {
      throw new ApiError(`slots[${i}]: endTime must be after startTime`, 400);
    }
    if (startTime <= now) {
      throw new ApiError(`slots[${i}]: startTime must be in the future`, 400);
    }
    return { startTime, endTime };
  });
}

// PENDING_MENTOR + Mentor PROPOSE_SLOTS -> PENDING_MENTEE.
// Related writes (same transaction as the status flip):
//   - a new SchedulingRound, roundNumber = (previous max for this request) + 1
//   - its OfferedSlot rows (2-3, validated by normalizeSlots)
// Round 1 is type INITIAL; any later round is EXTRA_SLOTS (RESCHEDULE_* types
// belong to rescheduling, which is out of scope). The higher roundNumber is
// what makes earlier rounds' slots non-current — see the note on selectSlot.
function proposeSlots(requestId, actingUserId, rawSlots) {
  const slots = normalizeSlots(rawSlots, new Date());

  return runAction(
    requestId,
    ACTION.PROPOSE_SLOTS,
    actingUserId,
    async (tx, request) => {
      const last = await tx.schedulingRound.findFirst({
        where: { requestId: request.id },
        orderBy: { roundNumber: "desc" },
        select: { roundNumber: true },
      });
      const roundNumber = (last ? last.roundNumber : 0) + 1;

      await tx.schedulingRound.create({
        data: {
          requestId: request.id,
          roundNumber,
          type: roundNumber === 1 ? "INITIAL" : "EXTRA_SLOTS",
          offeredSlots: { create: slots },
        },
      });
    }
  );
}

// ----------------------------------------------------------------------------
// SELECT_SLOT — mentee locks in exactly one offered time.
// ----------------------------------------------------------------------------

// PENDING_MENTEE + Mentee SELECT_SLOT -> SCHEDULED (status MATCHED).
// The chosen slot must pass THREE checks, all inside the same transaction as
// the status flip so a bad choice rolls the whole thing back:
//   1. it belongs to a SchedulingRound of THIS request        (not another request's slot)
//   2. that round is the CURRENT round (highest roundNumber)   (not a superseded round)
//   3. its startTime is still in the future                    (not a stale slot)
// On success it creates the request's Meeting (attemptNumber 1 for this MVP —
// SCHEDULED is terminal, so there is never a 2nd attempt here), pointing at the
// chosen OfferedSlot. "Exactly one selected slot" is guaranteed by creating
// exactly one Meeting; Meeting.selectedSlotId is @unique as a DB backstop.
function selectSlot(requestId, actingUserId, rawOfferedSlotId) {
  const offeredSlotId = parseId(rawOfferedSlotId, "offeredSlotId");

  return runAction(
    requestId,
    ACTION.SELECT_SLOT,
    actingUserId,
    async (tx, request) => {
      // Current round = the highest roundNumber for this request.
      const currentRound = await tx.schedulingRound.findFirst({
        where: { requestId: request.id },
        orderBy: { roundNumber: "desc" },
        include: { offeredSlots: true },
      });
      // Should be impossible in PENDING_MENTEE (PROPOSE_SLOTS always creates a
      // round in the same transaction as the status flip), but fail loudly
      // rather than schedule nothing.
      if (!currentRound) {
        throw new ApiError(
          `Request ${request.id} is ${request.status} but has no proposal round`,
          409
        );
      }

      const slot = currentRound.offeredSlots.find((s) => s.id === offeredSlotId);
      if (!slot) {
        // Covers: slot id from an older round, from another request, or made up.
        throw new ApiError(
          `Offered slot ${offeredSlotId} is not part of the current proposal round for request ${request.id}`,
          409
        );
      }
      if (slot.startTime <= new Date()) {
        throw new ApiError(
          `Offered slot ${offeredSlotId} has already started and can no longer be selected`,
          409
        );
      }

      await tx.meeting.create({
        data: {
          requestId: request.id,
          selectedSlotId: slot.id,
          attemptNumber: 1,
          scheduledStart: slot.startTime,
          scheduledEnd: slot.endTime,
          status: "SCHEDULED", // MeetingStatus.SCHEDULED == request MATCHED
        },
      });
    }
  );
}

// ----------------------------------------------------------------------------
// CANCEL — mentor ends the request after having proposed (or after scheduling).
// ----------------------------------------------------------------------------

// PENDING_MENTEE + Mentor CANCEL -> CANCELLED            (no side writes)
// MATCHED        + Mentor CANCEL -> CANCELLED            (also: Meeting -> CANCELLED)
// Both outcomes commit in one transaction with the status flip. Mentors are
// volunteers; this is their escape hatch when they become unavailable. REJECTED
// and CANCELLED have no CANCEL row, so a terminal request cannot be re-cancelled.
function mentorCancel(requestId, actingUserId) {
  return runAction(
    requestId,
    ACTION.CANCEL,
    actingUserId,
    async (tx, request, transition) => {
      if (transition.from === STATUS.MATCHED) {
        // Keep the scheduled Meeting consistent with the now-cancelled request.
        // Scoped to status SCHEDULED so a future COMPLETED/NOT_COMPLETED meeting
        // (Part 4) is never overwritten. In this MVP there is exactly one.
        await tx.meeting.updateMany({
          where: { requestId: request.id, status: "SCHEDULED" },
          data: { status: "CANCELLED" },
        });
      }
    }
  );
}

module.exports = {
  STATUS,
  ACTION,
  ROLE,
  RETRY_LIMIT,
  TRANSITIONS,
  guardTransition,
  applyStatusChange,
  reject,
  withdraw,
  cannotAttend,
  proposeSlots,
  selectSlot,
  mentorCancel,
};
