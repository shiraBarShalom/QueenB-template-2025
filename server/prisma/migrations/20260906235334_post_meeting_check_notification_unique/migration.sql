-- Idempotency backstop for the lazily-materialized post-meeting notification
-- (services/postMeetingService.js -> materializeDuePostMeetingNotificationsForUser).
-- One POST_MEETING_CHECK per (recipient, meeting): the same Meeting can never
-- generate that notification for the same user twice, whichever code path (or
-- future scheduled worker) creates it. Partial index so it does not constrain
-- any other notification type. Prisma does not model partial unique indexes, so
-- this lives only in the migration.
CREATE UNIQUE INDEX "Notification_post_meeting_check_uq"
  ON "Notification" ("recipientId", "meetingId")
  WHERE "type" = 'POST_MEETING_CHECK';
