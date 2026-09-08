-- Mentee counter-proposal ("mentor proposed times, none fit, the mentee offers
-- her own instead of asking for another mentor round").
--
-- The scheduling state machine already represents "mentor's turn to provide
-- times" as WAITING_FOR_MENTOR_SLOTS, and after a normal CANNOT_ATTEND that
-- state already has a populated latest SchedulingRound. A mentee-authored round
-- is therefore structurally identical to a mentor-owed one unless the round's
-- author is persisted. This adds the single marker that distinguishes them.
--
-- Additive + nullable, reusing the existing "ParticipantRole" enum (no new
-- enum, no new MentoringRequestStatus): NULL for every existing row and for
-- every mentor-proposed round; 'MENTEE' only for a counter-proposal round.

-- AlterTable
ALTER TABLE "SchedulingRound" ADD COLUMN "proposedByRole" "ParticipantRole";
