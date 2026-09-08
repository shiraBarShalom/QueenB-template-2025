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
const { createNotifications } = require("./notificationService");
// Outbound email is a NOTIFICATION SIDE EFFECT only — never part of a
// transaction. It is dispatched AFTER runAction() has committed (see
// selectSlot), fire-and-forget, and can never fail or delay a scheduling action.
const emailService = require("./emailService");

// ----------------------------------------------------------------------------
// Notification side effects
// ----------------------------------------------------------------------------
// Every scheduling transition that the OPPOSITE participant needs to know about
// writes an IN_APP Notification in the SAME interactive transaction as the
// status change (via runAction's sideEffect). Row + notification therefore
// commit or roll back together: the mentee is told "slots are ready" iff the
// SchedulingRound actually got created, never otherwise.

// Pull the two people on a request out of the REQUEST_INCLUDE-shaped snapshot.
function participants(request) {
  return {
    menteeId: request.menteeId,
    mentorUserId: request.mentorProfile.userId,
    menteeName: request.mentee ? request.mentee.fullName : null,
    mentorName:
      request.mentorProfile && request.mentorProfile.user
        ? request.mentorProfile.user.fullName
        : null,
  };
}

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
  // Mentee counter-proposal: the mentor proposed times, none fit, and instead of
  // spending a CANNOT_ATTEND to send the request back empty-handed the mentee
  // offers 1-3 times that DO work for her. Shares the CANNOT_ATTEND retry budget
  // (bumps retryCount, capped at RETRY_LIMIT) so it can never open a new loop.
  SUGGEST_SLOTS: "SUGGEST_SLOTS",
  // Mentor picks ONE of the mentee's suggested times. Same outcome as the mentee
  // SELECT_SLOT (-> MATCHED, one Meeting via the shared path) but performed by
  // the mentor, and only valid while the current round is a mentee counter-proposal.
  APPROVE_SUGGESTED_SLOT: "APPROVE_SUGGESTED_SLOT",
  WITHDRAW: "WITHDRAW",
  CANCEL: "CANCEL",
  // Part 14: a meeting is already scheduled (MATCHED) but one side can no longer
  // attend. EITHER participant may send the request back into scheduling, ONCE.
  RESCHEDULE: "RESCHEDULE",
  // Part 15: a meeting is scheduled (MATCHED) and a participant cannot attend.
  // EITHER participant may end the request (with a recorded reason) at any time
  // while MATCHED — including before the one post-match RESCHEDULE has been used.
  // NOT a reschedule: no new round is opened; the Meeting is cancelled.
  CANNOT_ATTEND_MEETING: "CANNOT_ATTEND_MEETING",
};

// Which side of the request the caller of an action must be.
const ROLE = { MENTOR: "MENTOR", MENTEE: "MENTEE" };

// Max number of CANNOT_ATTEND retries. Confirmed product decision: at
// retryCount 2 a further CANNOT_ATTEND does NOT open a 4th round — it closes the
// request (-> CANCELLED) and retryCount stays 2.
const RETRY_LIMIT = 2;

// ----------------------------------------------------------------------------
// Mentor double-booking protection (mentor-level availability).
// ----------------------------------------------------------------------------
// A mentor cannot hold two meetings at overlapping times, across ANY of her
// requests. `proposeSlots` rejects a slot that overlaps one of these meetings,
// and getMentorBusyIntervals feeds the picker so taken times are greyed out.
//
// Blocking set: a live agreed meeting (SCHEDULED) or one both sides have
// confirmed attendance for (ATTENDANCE_CONFIRMED) occupies its interval.
// NOT blocking: CANCELLED, RESCHEDULED (superseded, kept only for history),
// COMPLETED / NOT_COMPLETED (in the past, done). Future-only: the check and the
// read model both filter scheduledEnd > now, so a past meeting never blocks a
// future proposal.
const MEETING_BLOCKING_STATUSES = ["SCHEDULED", "ATTENDANCE_CONFIRMED"];

// Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd). Touching exactly
// at a boundary (aEnd === bStart) is NOT an overlap — back-to-back meetings are
// allowed. Accepts Date objects.
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

// Every (slot, meeting) pair where a proposed slot overlaps one of the mentor's
// blocking meetings. `client` may be a Prisma tx handle so the check is atomic
// with the round insert (and therefore re-evaluated at accept time — a slot that
// was free when the tab loaded is still rejected if it was booked meanwhile).
// `excludeRequestId` skips the request's own meetings (its superseded ones are
// already excluded by status, this is just belt-and-braces).
async function findMentorSlotConflicts(
  client,
  mentorProfileId,
  slots,
  now,
  excludeRequestId = null
) {
  const where = {
    status: { in: MEETING_BLOCKING_STATUSES },
    scheduledEnd: { gt: now },
    request: { mentorProfileId },
  };
  if (excludeRequestId != null) where.NOT = { requestId: excludeRequestId };

  const busy = await client.meeting.findMany({
    where,
    select: {
      id: true,
      requestId: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });

  const conflicts = [];
  for (const slot of slots) {
    for (const m of busy) {
      if (
        intervalsOverlap(
          slot.startTime,
          slot.endTime,
          m.scheduledStart,
          m.scheduledEnd
        )
      ) {
        conflicts.push({ slot, meeting: m });
      }
    }
  }
  return conflicts;
}

// Read model for the propose-slots UI: the mentor's UPCOMING occupied intervals
// (same blocking set as the write-side check). Read-only; the authoritative
// rejection is in proposeSlots.
async function getMentorBusyIntervals(rawMentorProfileId) {
  const mentorProfileId = parseId(rawMentorProfileId, "mentorProfileId");
  const rows = await prisma.meeting.findMany({
    where: {
      status: { in: MEETING_BLOCKING_STATUSES },
      scheduledEnd: { gt: new Date() },
      request: { mentorProfileId },
    },
    orderBy: { scheduledStart: "asc" },
    select: { id: true, scheduledStart: true, scheduledEnd: true },
  });
  return rows.map((r) => ({
    meetingId: r.id,
    start: r.scheduledStart,
    end: r.scheduledEnd,
  }));
}

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

  // Mentor approves one of the mentee's suggested times (the current round is a
  // mentee counter-proposal — see SUGGEST_SLOTS below). The request is
  // WAITING_FOR_MENTOR_SLOTS exactly as after a CANNOT_ATTEND, so this row and
  // PROPOSE_SLOTS / REJECT are all legal from here; approveSuggestedSlot's side
  // effect additionally requires the current round to be MENTEE-authored, so it
  // can never fire on an ordinary mentor-owed round.
  // PENDING_MENTOR + Mentor APPROVE_SUGGESTED_SLOT -> SCHEDULED
  {
    action: ACTION.APPROVE_SUGGESTED_SLOT,
    from: STATUS.WAITING_FOR_MENTOR_SLOTS,
    role: ROLE.MENTOR,
    to: STATUS.MATCHED,
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

  // Mentee counter-proposal while still under the retry limit: instead of
  // CANNOT_ATTEND (send it back empty and make the mentor invent another set),
  // the mentee offers 1-3 times that work for her. Uses the SAME retry budget as
  // CANNOT_ATTEND (bumps retryCount, gated on retryCount < RETRY_LIMIT), so the
  // round ladder still terminates. At the cap the mentee has no SUGGEST_SLOTS
  // row (guardTransition -> 409); she uses CANNOT_ATTEND / WITHDRAW as before.
  // PENDING_MENTEE + SUGGEST_SLOTS [retryCount < 2] -> PENDING_MENTOR, +1 retry.
  {
    action: ACTION.SUGGEST_SLOTS,
    from: STATUS.WAITING_FOR_MENTEE_SELECTION,
    role: ROLE.MENTEE,
    when: (r) => r.retryCount < RETRY_LIMIT,
    to: STATUS.WAITING_FOR_MENTOR_SLOTS,
    bumpsRetryCount: true,
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

  // Post-match rescheduling (Part 14). A Meeting exists but a participant cannot
  // attend the agreed time. EITHER side may move the request back to
  // WAITING_FOR_MENTOR_SLOTS so the mentor offers fresh times — but only while
  // the single post-match iteration has not been spent
  // (rescheduleAfterMatchUsed === false). reschedule() also flips the scheduled
  // Meeting to RESCHEDULED and sets the flag, in the same transaction.
  // MATCHED + (mentor|mentee) RESCHEDULE [!rescheduleAfterMatchUsed] -> WAITING_FOR_MENTOR_SLOTS
  {
    action: ACTION.RESCHEDULE,
    from: STATUS.MATCHED,
    role: ROLE.MENTOR,
    when: (r) => !r.rescheduleAfterMatchUsed,
    to: STATUS.WAITING_FOR_MENTOR_SLOTS,
    bumpsRetryCount: false,
  },
  {
    action: ACTION.RESCHEDULE,
    from: STATUS.MATCHED,
    role: ROLE.MENTEE,
    when: (r) => !r.rescheduleAfterMatchUsed,
    to: STATUS.WAITING_FOR_MENTOR_SLOTS,
    bumpsRetryCount: false,
  },

  // Post-match cancel (Part 15). A participant cannot attend the scheduled
  // meeting and chooses to end it (with a reason) rather than reschedule.
  // Available whenever MATCHED — independent of rescheduleAfterMatchUsed so
  // cancel is never blocked behind the one-reschedule option. RESCHEDULE keeps
  // its own once-only `when`. cannotAttendMeeting() flips the Meeting to
  // CANCELLED (who / why / when) and notifies the other participant.
  // MATCHED + (mentor|mentee) CANNOT_ATTEND_MEETING -> CANCELLED
  {
    action: ACTION.CANNOT_ATTEND_MEETING,
    from: STATUS.MATCHED,
    role: ROLE.MENTOR,
    to: STATUS.CANCELLED,
    bumpsRetryCount: false,
  },
  {
    action: ACTION.CANNOT_ATTEND_MEETING,
    from: STATUS.MATCHED,
    role: ROLE.MENTEE,
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

  // Most (action, from) pairs are single-role. A few (RESCHEDULE) are legal for
  // EITHER participant — so resolve which side the caller actually is on this
  // request, then keep only the candidate rows for that role. A caller who is
  // neither the mentor nor the mentee, or whose role no candidate allows, is
  // rejected 403 before any condition is evaluated.
  const actorRole =
    actingUserId === request.mentorProfile.userId
      ? ROLE.MENTOR
      : actingUserId === request.menteeId
      ? ROLE.MENTEE
      : null;
  const allowedRoles = new Set(candidates.map((t) => t.role));
  if (!actorRole || !allowedRoles.has(actorRole)) {
    const requiredRole = candidates[0].role;
    throw new ApiError(
      `User ${actingUserId} is not the ${requiredRole.toLowerCase()} of request ${requestId}`,
      403
    );
  }

  const roleCandidates = candidates.filter((t) => t.role === actorRole);
  const transition = roleCandidates.find((t) => !t.when || t.when(request));
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
  return runAction(requestId, ACTION.REJECT, actingUserId, async (tx, request) => {
    const p = participants(request);
    await createNotifications(tx, [
      {
        recipientId: p.menteeId,
        type: "REQUEST_REJECTED",
        requestId: request.id,
        payload: { mentorName: p.mentorName },
      },
    ]);
  });
}

// PENDING_MENTOR + Mentee WITHDRAW -> CANCELLED
// PENDING_MENTEE + Mentee WITHDRAW -> CANCELLED
// Same action, two legal from-states; guardTransition matches the right row.
// Never touches retryCount.
function withdraw(requestId, actingUserId) {
  return runAction(requestId, ACTION.WITHDRAW, actingUserId, async (tx, request) => {
    const p = participants(request);
    await createNotifications(tx, [
      {
        recipientId: p.mentorUserId,
        type: "REQUEST_CANCELLED",
        requestId: request.id,
        payload: { menteeName: p.menteeName, reason: "withdrawn" },
      },
    ]);
  });
}

// PENDING_MENTEE + Mentee CANNOT_ATTEND. Outcome chosen by guardTransition from
// retryCount:
//   retryCount < 2  -> PENDING_MENTOR, retryCount += 1  (mentor owes another round)
//   retryCount == 2 -> CANCELLED,      retryCount stays 2 (confirmed: no 4th round)
// applyStatusChange does the +1 only for the row whose bumpsRetryCount is true.
// No side writes: the just-rejected round's slots stop being selectable
// structurally (the next PROPOSE_SLOTS creates a higher-numbered round).
function cannotAttend(requestId, actingUserId) {
  return runAction(
    requestId,
    ACTION.CANNOT_ATTEND,
    actingUserId,
    async (tx, request, transition) => {
      const p = participants(request);
      if (transition.to === STATUS.WAITING_FOR_MENTOR_SLOTS) {
        // Another round is owed — the mentor is the one who must act next.
        await createNotifications(tx, [
          {
            recipientId: p.mentorUserId,
            type: "RESCHEDULE_REQUIRED",
            requestId: request.id,
            payload: { menteeName: p.menteeName, reason: "moreSlots" },
          },
        ]);
      } else {
        // Retry limit reached: the request is closed for good. Tell both sides,
        // with copy that reflects the real number of rounds allowed.
        await createNotifications(tx, [
          {
            recipientId: p.menteeId,
            type: "REQUEST_CANCELLED",
            requestId: request.id,
            payload: { mentorName: p.mentorName, reason: "noSlotsFound", rounds: RETRY_LIMIT + 1 },
          },
          {
            recipientId: p.mentorUserId,
            type: "REQUEST_CANCELLED",
            requestId: request.id,
            payload: { menteeName: p.menteeName, reason: "noSlotsFound", rounds: RETRY_LIMIT + 1 },
          },
        ]);
      }
    }
  );
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
      // Mentor double-booking guard. Runs INSIDE the transaction so a slot that
      // looked free when the mentor's tab loaded is still rejected here if a
      // meeting was booked in the meantime (stale-tab / two-tabs race).
      const conflicts = await findMentorSlotConflicts(
        tx,
        request.mentorProfileId,
        slots,
        new Date(),
        request.id
      );
      if (conflicts.length > 0) {
        const { slot } = conflicts[0];
        throw new ApiError(
          `Proposed slot ${slot.startTime.toISOString()}–${slot.endTime.toISOString()} ` +
            `overlaps an existing scheduled meeting for this mentor`,
          409
        );
      }

      const last = await tx.schedulingRound.findFirst({
        where: { requestId: request.id },
        orderBy: { roundNumber: "desc" },
        select: { roundNumber: true },
      });
      const roundNumber = (last ? last.roundNumber : 0) + 1;

      // Round 1 -> INITIAL. Later rounds are EXTRA_SLOTS (mentee used
      // CANNOT_ATTEND) unless this request has already gone through a post-match
      // RESCHEDULE, in which case the fresh times are for re-scheduling an
      // already-agreed meeting -> RESCHEDULE_BEFORE_MEETING. Scheduling history
      // (older rounds + their slots) is preserved either way.
      let type = "INITIAL";
      if (roundNumber > 1) {
        type = request.rescheduleAfterMatchUsed ? "RESCHEDULE_BEFORE_MEETING" : "EXTRA_SLOTS";
      }

      await tx.schedulingRound.create({
        data: {
          requestId: request.id,
          roundNumber,
          type,
          offeredSlots: { create: slots },
        },
      });

      // The ball is now in the mentee's court — she has times to choose from.
      const p = participants(request);
      await createNotifications(tx, [
        {
          recipientId: p.menteeId,
          type: "SLOTS_AVAILABLE",
          requestId: request.id,
          payload: { mentorName: p.mentorName, slotCount: slots.length, roundNumber },
        },
      ]);
    }
  );
}

// ----------------------------------------------------------------------------
// Shared meeting creation — the ONE authoritative path from "an offered slot in
// the current round" to a SCHEDULED Meeting + MATCHED request.
// ----------------------------------------------------------------------------
// Used by BOTH SELECT_SLOT (mentee picks one of the mentor's proposed times)
// and APPROVE_SUGGESTED_SLOT (mentor picks one of the mentee's suggested times).
// There is deliberately no second Meeting-creation implementation.
//
// Runs inside the caller's interactive transaction (`tx`), after
// applyStatusChange has already won the (status, retryCount) compare-and-set, so
// a failure here rolls the whole action back. The chosen slot must pass:
//   1. it belongs to the CURRENT round (highest roundNumber) of THIS request
//   2. that round's author matches `expectProposedByRole` when given
//      (APPROVE_SUGGESTED_SLOT requires a MENTEE-authored round; SELECT_SLOT
//      passes null — it does not care)
//   3. its startTime is still in the future
//   4. when `checkMentorDoubleBooking`, its interval does not overlap one of the
//      mentor's live meetings (SELECT_SLOT skips this — the mentor already
//      cleared her own proposed times in proposeSlots; APPROVE_SUGGESTED_SLOT
//      needs it because the mentee's times never went through that guard)
// Returns the confirmationCtx snapshot for the caller's post-commit email.
async function createMeetingFromCurrentRound(
  tx,
  request,
  offeredSlotId,
  { expectProposedByRole = null, checkMentorDoubleBooking = false } = {}
) {
  const currentRound = await tx.schedulingRound.findFirst({
    where: { requestId: request.id },
    orderBy: { roundNumber: "desc" },
    include: { offeredSlots: true },
  });
  // Should be impossible in the from-states these actions allow (PROPOSE_SLOTS /
  // SUGGEST_SLOTS always create a round in the same transaction as the status
  // flip), but fail loudly rather than schedule nothing.
  if (!currentRound) {
    throw new ApiError(
      `Request ${request.id} is ${request.status} but has no proposal round`,
      409
    );
  }
  if (
    expectProposedByRole != null &&
    currentRound.proposedByRole !== expectProposedByRole
  ) {
    throw new ApiError(
      `The current round for request ${request.id} is not a ${expectProposedByRole.toLowerCase()} proposal`,
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

  if (checkMentorDoubleBooking) {
    // Re-checked here (inside the tx) so a slot that was free when the tab
    // loaded is still rejected if the mentor was booked meanwhile.
    const conflicts = await findMentorSlotConflicts(
      tx,
      request.mentorProfileId,
      [slot],
      new Date(),
      request.id
    );
    if (conflicts.length > 0) {
      throw new ApiError(
        `Slot ${slot.startTime.toISOString()}–${slot.endTime.toISOString()} ` +
          `overlaps an existing scheduled meeting for this mentor`,
        409
      );
    }
  }

  // attemptNumber is (highest so far) + 1. Normally 1; after a post-match
  // RESCHEDULE the previous Meeting is still on the request (status RESCHEDULED,
  // kept for history) so this is attempt 2, 3, ... The
  // @@unique([requestId, attemptNumber]) constraint backs this.
  const lastMeeting = await tx.meeting.findFirst({
    where: { requestId: request.id },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });
  const attemptNumber = (lastMeeting ? lastMeeting.attemptNumber : 0) + 1;

  const meeting = await tx.meeting.create({
    data: {
      requestId: request.id,
      selectedSlotId: slot.id,
      attemptNumber,
      scheduledStart: slot.startTime,
      scheduledEnd: slot.endTime,
      status: "SCHEDULED", // MeetingStatus.SCHEDULED == request MATCHED
    },
  });

  // A meeting is on the calendar — both people need to see it.
  const p = participants(request);
  const when = { start: slot.startTime, end: slot.endTime };
  await createNotifications(tx, [
    {
      recipientId: p.menteeId,
      type: "MEETING_MATCHED",
      requestId: request.id,
      meetingId: meeting.id,
      payload: { mentorName: p.mentorName, when },
    },
    {
      recipientId: p.mentorUserId,
      type: "MEETING_MATCHED",
      requestId: request.id,
      meetingId: meeting.id,
      payload: { menteeName: p.menteeName, when },
    },
  ]);

  // Snapshot for the post-commit confirmation email. Pure data — no I/O.
  // request is REQUEST_INCLUDE shaped, so mentee/mentor email + fullName are
  // already loaded.
  return {
    mentee: {
      email: request.mentee ? request.mentee.email : null,
      name: request.mentee ? request.mentee.fullName : null,
    },
    mentor: {
      email:
        request.mentorProfile && request.mentorProfile.user
          ? request.mentorProfile.user.email
          : null,
      name:
        request.mentorProfile && request.mentorProfile.user
          ? request.mentorProfile.user.fullName
          : null,
    },
    meeting: {
      id: meeting.id,
      scheduledStart: meeting.scheduledStart,
      scheduledEnd: meeting.scheduledEnd,
    },
  };
}

// Fire the meeting-confirmation email after the transaction has committed.
// Fire-and-forget: it can neither delay nor fail the scheduling action.
function dispatchConfirmationEmail(confirmationCtx) {
  if (!confirmationCtx) return;
  emailService
    .sendMeetingScheduledEmail(confirmationCtx)
    .catch((err) =>
      // eslint-disable-next-line no-console
      console.error(
        "[email] meeting confirmation dispatch failed:",
        err && err.message
      )
    );
}

// ----------------------------------------------------------------------------
// SELECT_SLOT — mentee locks in exactly one offered time.
// ----------------------------------------------------------------------------

// PENDING_MENTEE + Mentee SELECT_SLOT -> SCHEDULED (status MATCHED).
// All work is inside one transaction with the status flip (see
// createMeetingFromCurrentRound). "Exactly one selected slot" is guaranteed by
// creating exactly one Meeting; Meeting.selectedSlotId is @unique as a DB
// backstop. Duplicate protection is structural: a repeated / double-click
// SELECT_SLOT fails in guardTransition (MATCHED has no SELECT_SLOT row).
function selectSlot(requestId, actingUserId, rawOfferedSlotId) {
  const offeredSlotId = parseId(rawOfferedSlotId, "offeredSlotId");

  // Captured inside the transaction, consumed ONLY AFTER it commits.
  let confirmationCtx = null;

  const run = runAction(
    requestId,
    ACTION.SELECT_SLOT,
    actingUserId,
    async (tx, request) => {
      confirmationCtx = await createMeetingFromCurrentRound(
        tx,
        request,
        offeredSlotId
      );
    }
  );

  return run.then((result) => {
    dispatchConfirmationEmail(confirmationCtx);
    return result;
  });
}

// ----------------------------------------------------------------------------
// SUGGEST_SLOTS — mentee counter-proposal (mentor's times did not fit).
// ----------------------------------------------------------------------------

// A mentee counter-proposal carries 1-3 times (she may know only one that
// works). Same per-slot rules as a mentor proposal, plus a duplicate-start
// guard. Out-of-range / malformed lists are REJECTED, never clamped.
const MIN_SUGGESTED_SLOTS = 1;
const MAX_SUGGESTED_SLOTS = 3;

function normalizeSuggestedSlots(raw, now) {
  if (!Array.isArray(raw)) {
    throw new ApiError("slots must be an array of { startTime, endTime }", 400);
  }
  if (raw.length < MIN_SUGGESTED_SLOTS || raw.length > MAX_SUGGESTED_SLOTS) {
    throw new ApiError(
      `A suggestion must contain ${MIN_SUGGESTED_SLOTS}-${MAX_SUGGESTED_SLOTS} slots (got ${raw.length})`,
      400
    );
  }
  const seen = new Set();
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
    const key = startTime.getTime();
    if (seen.has(key)) {
      throw new ApiError(`slots[${i}]: duplicate start time`, 400);
    }
    seen.add(key);
    return { startTime, endTime };
  });
}

// PENDING_MENTEE + Mentee SUGGEST_SLOTS [retryCount < 2]
//   -> PENDING_MENTOR, retryCount += 1.
// Related writes (same transaction as the status flip):
//   - a new SchedulingRound, roundNumber = (previous max) + 1, marked
//     proposedByRole = MENTEE — the ONLY thing that tells the mentor's dashboard
//     this WAITING_FOR_MENTOR_SLOTS is "approve the mentee's times" rather than
//     "you owe a round".
//   - its OfferedSlot rows (1-3, validated by normalizeSuggestedSlots)
//   - a RESCHEDULE_REQUIRED notification to the mentor
//     (payload.reason = "menteeSuggested").
// Type mirrors proposeSlots: EXTRA_SLOTS normally, RESCHEDULE_BEFORE_MEETING if
// the request has already been through a post-match reschedule. The retry bump
// (bumpsRetryCount on the transition) shares the CANNOT_ATTEND budget, so the
// round ladder still terminates and no new loop is introduced.
function suggestSlots(requestId, actingUserId, rawSlots) {
  const slots = normalizeSuggestedSlots(rawSlots, new Date());

  return runAction(
    requestId,
    ACTION.SUGGEST_SLOTS,
    actingUserId,
    async (tx, request) => {
      const last = await tx.schedulingRound.findFirst({
        where: { requestId: request.id },
        orderBy: { roundNumber: "desc" },
        select: { roundNumber: true },
      });
      const roundNumber = (last ? last.roundNumber : 0) + 1;

      // roundNumber is always > 1 here (a mentor round was proposed first).
      const type = request.rescheduleAfterMatchUsed
        ? "RESCHEDULE_BEFORE_MEETING"
        : "EXTRA_SLOTS";

      await tx.schedulingRound.create({
        data: {
          requestId: request.id,
          roundNumber,
          type,
          proposedByRole: "MENTEE",
          offeredSlots: { create: slots },
        },
      });

      // The ball is in the mentor's court — she has times to approve or counter.
      const p = participants(request);
      await createNotifications(tx, [
        {
          recipientId: p.mentorUserId,
          type: "RESCHEDULE_REQUIRED",
          requestId: request.id,
          payload: {
            reason: "menteeSuggested",
            menteeName: p.menteeName,
            slotCount: slots.length,
            roundNumber,
          },
        },
      ]);
    }
  );
}

// ----------------------------------------------------------------------------
// APPROVE_SUGGESTED_SLOT — mentor accepts one of the mentee's suggested times.
// ----------------------------------------------------------------------------

// PENDING_MENTOR + Mentor APPROVE_SUGGESTED_SLOT -> SCHEDULED (status MATCHED).
// Goes through the SAME createMeetingFromCurrentRound path as SELECT_SLOT — one
// authoritative Meeting-creation implementation — with two extra guards:
//   - the current round must be MENTEE-authored (expectProposedByRole)
//   - the mentor double-booking check runs here (checkMentorDoubleBooking),
//     because the mentee's times never passed through proposeSlots' guard.
// Concurrency: applyStatusChange's (status, retryCount) compare-and-set means
// only one APPROVE_SUGGESTED_SLOT / PROPOSE_SLOTS / REJECT from this
// WAITING_FOR_MENTOR_SLOTS can win; a second tab approving another time loses
// with 409 and creates no Meeting.
function approveSuggestedSlot(requestId, actingUserId, rawOfferedSlotId) {
  const offeredSlotId = parseId(rawOfferedSlotId, "offeredSlotId");

  let confirmationCtx = null;

  const run = runAction(
    requestId,
    ACTION.APPROVE_SUGGESTED_SLOT,
    actingUserId,
    async (tx, request) => {
      confirmationCtx = await createMeetingFromCurrentRound(
        tx,
        request,
        offeredSlotId,
        { expectProposedByRole: "MENTEE", checkMentorDoubleBooking: true }
      );
    }
  );

  return run.then((result) => {
    dispatchConfirmationEmail(confirmationCtx);
    return result;
  });
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
      // The mentor ended it; the mentee is the one who needs to be told.
      const p = participants(request);
      await createNotifications(tx, [
        {
          recipientId: p.menteeId,
          type: "REQUEST_CANCELLED",
          requestId: request.id,
          payload: {
            mentorName: p.mentorName,
            reason: transition.from === STATUS.MATCHED ? "mentorCancelledMeeting" : "mentorCancelled",
          },
        },
      ]);
    }
  );
}

// ----------------------------------------------------------------------------
// RESCHEDULE — a participant cannot attend an already-scheduled meeting.
// ----------------------------------------------------------------------------

// MATCHED + (mentor|mentee) RESCHEDULE [!rescheduleAfterMatchUsed]
//   -> WAITING_FOR_MENTOR_SLOTS
// In the same transaction as the status flip:
//   - the current SCHEDULED Meeting is moved to RESCHEDULED (kept for history —
//     row + selectedSlot are NOT deleted) so a stale meeting can never keep
//     showing as active once rescheduling has begun;
//   - rescheduleAfterMatchUsed is set true, spending the single allowed
//     post-match iteration (a 2nd RESCHEDULE from a later MATCHED will 409 on
//     the transition's `when`);
//   - the OTHER participant is notified (RESCHEDULE_REQUIRED).
// The mentor then offers fresh times through the ordinary proposeSlots() path
// (roundNumber increments, type RESCHEDULE_BEFORE_MEETING), and the mentee
// selects one through selectSlot() (attemptNumber increments -> a new Meeting).
function reschedule(requestId, actingUserId) {
  return runAction(
    requestId,
    ACTION.RESCHEDULE,
    actingUserId,
    async (tx, request) => {
      // Guarded by the transition's `when`, but re-assert under the CAS so a
      // racing RESCHEDULE cannot double-spend the iteration.
      const { count } = await tx.mentoringRequest.updateMany({
        where: { id: request.id, rescheduleAfterMatchUsed: false },
        data: { rescheduleAfterMatchUsed: true },
      });
      if (count !== 1) {
        throw new ApiError(
          `Request ${request.id} has already used its post-match rescheduling`,
          409
        );
      }

      await tx.meeting.updateMany({
        where: { requestId: request.id, status: "SCHEDULED" },
        data: { status: "RESCHEDULED" },
      });

      const p = participants(request);
      const otherId =
        actingUserId === p.mentorUserId ? p.menteeId : p.mentorUserId;
      await createNotifications(tx, [
        {
          recipientId: otherId,
          type: "RESCHEDULE_REQUIRED",
          requestId: request.id,
          payload: {
            reason: "cannotAttendMeeting",
            byMentor: actingUserId === p.mentorUserId,
            mentorName: p.mentorName,
            menteeName: p.menteeName,
          },
        },
      ]);
    }
  );
}

// ----------------------------------------------------------------------------
// CANNOT_ATTEND_MEETING — a participant cancels an already-scheduled meeting
// (Part 15). Independent of the one-reschedule limit.
// ----------------------------------------------------------------------------

// A reason for the other side is REQUIRED. Trimmed, with a sane length window so
// it is neither empty/uninformative nor an essay stored in one row.
const MIN_CANNOT_ATTEND_REASON = 10;
const MAX_CANNOT_ATTEND_REASON = 500;

function normalizeCannotAttendReason(raw) {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < MIN_CANNOT_ATTEND_REASON) {
    throw new ApiError(
      `reason must be at least ${MIN_CANNOT_ATTEND_REASON} characters`,
      400
    );
  }
  if (reason.length > MAX_CANNOT_ATTEND_REASON) {
    throw new ApiError(
      `reason must be at most ${MAX_CANNOT_ATTEND_REASON} characters`,
      400
    );
  }
  return reason;
}

// MATCHED + (mentor|mentee) CANNOT_ATTEND_MEETING -> CANCELLED.
// In the same transaction as the status flip:
//   - the current SCHEDULED Meeting is moved to CANCELLED and stamped with
//     cancelledByUserId / cancellationReason / cancelledAt (the authoritative
//     record — older RESCHEDULED/other meetings and every SchedulingRound are
//     left untouched, so history is preserved);
//   - the OTHER participant gets a REQUEST_CANCELLED notification whose payload
//     carries `reason: "cannotAttendMeeting"`, `byMentor`, and the free-text
//     `explanation` for display.
// Distinct from RESCHEDULE (which opens a new round and spends the one-time
// flag) and from mentorCancel (mentor-only, no reason required).
function cannotAttendMeeting(requestId, actingUserId, rawReason) {
  const reason = normalizeCannotAttendReason(rawReason);

  return runAction(
    requestId,
    ACTION.CANNOT_ATTEND_MEETING,
    actingUserId,
    async (tx, request) => {
      const meeting = await tx.meeting.findFirst({
        where: { requestId: request.id, status: "SCHEDULED" },
        orderBy: { attemptNumber: "desc" },
        select: { id: true },
      });
      // A MATCHED request always has exactly one SCHEDULED meeting. If it is
      // gone, the row moved under us (concurrent cancel / mentor cancel) — fail
      // the whole action rather than end the request with no meeting cancelled.
      if (!meeting) {
        throw new ApiError(
          `Request ${request.id} is ${request.status} but has no scheduled meeting to cancel`,
          409
        );
      }

      await tx.meeting.update({
        where: { id: meeting.id },
        data: {
          status: "CANCELLED",
          cancelledByUserId: actingUserId,
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
      });

      const p = participants(request);
      const byMentor = actingUserId === p.mentorUserId;
      const otherId = byMentor ? p.menteeId : p.mentorUserId;
      await createNotifications(tx, [
        {
          recipientId: otherId,
          type: "REQUEST_CANCELLED",
          requestId: request.id,
          meetingId: meeting.id,
          payload: {
            reason: "cannotAttendMeeting",
            byMentor,
            mentorName: p.mentorName,
            menteeName: p.menteeName,
            explanation: reason,
          },
        },
      ]);
    }
  );
}

module.exports = {
  STATUS,
  ACTION,
  ROLE,
  RETRY_LIMIT,
  TRANSITIONS,
  MIN_CANNOT_ATTEND_REASON,
  MAX_CANNOT_ATTEND_REASON,
  guardTransition,
  applyStatusChange,
  reject,
  withdraw,
  cannotAttend,
  proposeSlots,
  selectSlot,
  suggestSlots,
  approveSuggestedSlot,
  mentorCancel,
  reschedule,
  cannotAttendMeeting,
  MEETING_BLOCKING_STATUSES,
  intervalsOverlap,
  findMentorSlotConflicts,
  getMentorBusyIntervals,
};
