-- Post-meeting continuation (product requirement: "both sides answer whether
-- they want another mentoring meeting; only when BOTH say YES may the pair
-- coordinate another meeting").
--
-- wouldContinueMentoring is mentee-only (Feedback_continue_is_mentee_only) and a
-- 3-value analytics signal, so it cannot express a symmetric YES/YES gate. This
-- adds a dedicated boolean answered by BOTH participants.

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN "wantsAnotherMeeting" BOOLEAN;

-- Only meaningful when the meeting actually happened. Left nullable (not required
-- at the DB level) so existing occurred = true rows created before this migration
-- stay valid; the application layer (normalizeSubmission) requires it going
-- forward. Prisma does not model CHECK constraints, so this lives only here.
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_wants_another_only_when_occurred"
  CHECK ("wantsAnotherMeeting" IS NULL OR "occurred" = true);
