/*
  Warnings:

  - You are about to drop the column `answers` on the `Feedback` table. All the data in the column will be lost.
  - Added the required column `authorRole` to the `Feedback` table without a default value. This is not possible if the table is not empty.
  - Added the required column `occurred` to the `Feedback` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('MENTEE', 'MENTOR');

-- CreateEnum
CREATE TYPE "MeetingNonOccurrenceReason" AS ENUM ('COULD_NOT_ATTEND', 'OTHER_PARTY_NO_SHOW', 'CANCELLED_IN_ADVANCE', 'TECHNICAL_ISSUE', 'COULD_NOT_RESCHEDULE', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingHelpfulness" AS ENUM ('YES', 'SOMEWHAT', 'NO');

-- CreateEnum
CREATE TYPE "ContinueMentoringInterest" AS ENUM ('YES', 'NO', 'NOT_SURE_YET');

-- AlterTable
ALTER TABLE "Feedback" DROP COLUMN "answers",
ADD COLUMN     "authorRole" "ParticipantRole" NOT NULL,
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "notOccurredExplanation" TEXT,
ADD COLUMN     "notOccurredReason" "MeetingNonOccurrenceReason",
ADD COLUMN     "occurred" BOOLEAN NOT NULL,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "wasHelpful" "MeetingHelpfulness",
ADD COLUMN     "wouldContinueMentoring" "ContinueMentoringInterest";

-- CreateIndex
CREATE INDEX "Feedback_authorRole_idx" ON "Feedback"("authorRole");

-- CreateIndex
CREATE INDEX "Feedback_occurred_idx" ON "Feedback"("occurred");

-- CreateIndex
CREATE INDEX "Feedback_notOccurredReason_idx" ON "Feedback"("notOccurredReason");

-- CreateIndex
CREATE INDEX "Feedback_rating_idx" ON "Feedback"("rating");

-- Post-meeting feedback integrity. Prisma does not model CHECK constraints, so
-- these live only in the migration; they do not change the generated client.
-- 1) rating, when present, is 1..5.
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_rating_range"
  CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));

-- 2) the two branches are mutually exclusive and each carries its own answers:
--    occurred = true  -> rating + wasHelpful present, no notOccurredReason
--    occurred = false -> notOccurredReason present, no rating / wasHelpful /
--                        wouldContinueMentoring
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_branch_shape"
  CHECK (
    ("occurred" = true
      AND "rating" IS NOT NULL
      AND "wasHelpful" IS NOT NULL
      AND "notOccurredReason" IS NULL)
    OR
    ("occurred" = false
      AND "notOccurredReason" IS NOT NULL
      AND "rating" IS NULL
      AND "wasHelpful" IS NULL
      AND "wouldContinueMentoring" IS NULL)
  );

-- 3) OTHER must come with an explanation.
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_other_reason_needs_text"
  CHECK (
    "notOccurredReason" IS DISTINCT FROM 'OTHER'
    OR ("notOccurredExplanation" IS NOT NULL AND length(btrim("notOccurredExplanation")) > 0)
  );

-- 4) continuation interest is a mentee-only answer.
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_continue_is_mentee_only"
  CHECK ("wouldContinueMentoring" IS NULL OR "authorRole" = 'MENTEE');
