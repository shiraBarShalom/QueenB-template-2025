-- Point Prisma at the existing identity tables and add matching/scheduling.
-- Does not recreate `users` and does not move or delete existing accounts.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE mentor_profiles
  ADD COLUMN IF NOT EXISTS background TEXT NOT NULL DEFAULT '';

UPDATE mentor_profiles AS mentor
SET background = profile.background
FROM user_profiles AS profile
WHERE mentor.user_id = profile.user_id
  AND (mentor.background IS NULL OR mentor.background = '')
  AND profile.background IS NOT NULL
  AND BTRIM(profile.background) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);

DO $$ BEGIN
  CREATE TYPE "MentoringRequestStatus" AS ENUM (
    'WAITING_FOR_MENTOR_SLOTS',
    'WAITING_FOR_MENTEE_SELECTION',
    'REJECTED',
    'MATCHED',
    'ATTENDANCE_CONFIRMED',
    'COMPLETED',
    'NOT_COMPLETED',
    'FEEDBACK_COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SchedulingRoundType" AS ENUM (
    'INITIAL',
    'EXTRA_SLOTS',
    'RESCHEDULE_BEFORE_MEETING',
    'RESCHEDULE_AFTER_NO_SHOW'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MeetingStatus" AS ENUM (
    'SCHEDULED',
    'ATTENDANCE_CONFIRMED',
    'COMPLETED',
    'NOT_COMPLETED',
    'RESCHEDULED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'DECLINED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'MENTORING_REQUEST_RECEIVED',
    'REQUEST_REJECTED',
    'SLOTS_AVAILABLE',
    'MEETING_MATCHED',
    'RESCHEDULE_REQUIRED',
    'MEETING_REMINDER',
    'ATTENDANCE_CONFIRMATION_REQUEST',
    'POST_MEETING_CHECK',
    'FEEDBACK_REMINDER',
    'MENTOR_THANK_YOU'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM (
    'IN_APP',
    'WHATSAPP'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationStatus" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Technology" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "MentoringTopic" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "MentoringRequest" (
  "id" SERIAL PRIMARY KEY,
  "menteeId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "mentorProfileId" BIGINT NOT NULL REFERENCES mentor_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "MentoringRequestStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MentoringRequest_status_idx" ON "MentoringRequest" ("status");
CREATE INDEX IF NOT EXISTS "MentoringRequest_menteeId_idx" ON "MentoringRequest" ("menteeId");
CREATE INDEX IF NOT EXISTS "MentoringRequest_mentorProfileId_idx" ON "MentoringRequest" ("mentorProfileId");

CREATE TABLE IF NOT EXISTS "SchedulingRound" (
  "id" SERIAL PRIMARY KEY,
  "requestId" INTEGER NOT NULL REFERENCES "MentoringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "roundNumber" INTEGER NOT NULL,
  "type" "SchedulingRoundType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("requestId", "roundNumber")
);

CREATE TABLE IF NOT EXISTS "OfferedSlot" (
  "id" SERIAL PRIMARY KEY,
  "schedulingRoundId" INTEGER NOT NULL REFERENCES "SchedulingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OfferedSlot_schedulingRoundId_idx" ON "OfferedSlot" ("schedulingRoundId");

CREATE TABLE IF NOT EXISTS "Meeting" (
  "id" SERIAL PRIMARY KEY,
  "requestId" INTEGER NOT NULL REFERENCES "MentoringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "selectedSlotId" INTEGER UNIQUE REFERENCES "OfferedSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "attemptNumber" INTEGER NOT NULL,
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  "status" "MeetingStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("requestId", "attemptNumber")
);

CREATE INDEX IF NOT EXISTS "Meeting_scheduledStart_idx" ON "Meeting" ("scheduledStart");
CREATE INDEX IF NOT EXISTS "Meeting_status_idx" ON "Meeting" ("status");

CREATE TABLE IF NOT EXISTS "AttendanceConfirmation" (
  "id" SERIAL PRIMARY KEY,
  "meetingId" INTEGER NOT NULL REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "AttendanceStatus" NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("meetingId", "userId")
);

CREATE TABLE IF NOT EXISTS "MeetingOutcomeConfirmation" (
  "id" SERIAL PRIMARY KEY,
  "meetingId" INTEGER NOT NULL REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurred" BOOLEAN NOT NULL,
  "wantsReschedule" BOOLEAN,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("meetingId", "userId")
);

CREATE TABLE IF NOT EXISTS "Feedback" (
  "id" SERIAL PRIMARY KEY,
  "meetingId" INTEGER NOT NULL REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authorId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "answers" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("meetingId", "authorId")
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" SERIAL PRIMARY KEY,
  "recipientId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" INTEGER REFERENCES "MentoringRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "meetingId" INTEGER REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Notification_status_idx" ON "Notification" ("status");
CREATE INDEX IF NOT EXISTS "Notification_scheduledAt_idx" ON "Notification" ("scheduledAt");

CREATE TABLE IF NOT EXISTS "_TechnologyToUser" (
  "A" INTEGER NOT NULL REFERENCES "Technology"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "B" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("A", "B")
);

CREATE INDEX IF NOT EXISTS "_TechnologyToUser_B_index" ON "_TechnologyToUser" ("B");

CREATE TABLE IF NOT EXISTS "_MentorProfileToMentoringTopic" (
  "A" BIGINT NOT NULL REFERENCES mentor_profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "B" INTEGER NOT NULL REFERENCES "MentoringTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("A", "B")
);

CREATE INDEX IF NOT EXISTS "_MentorProfileToMentoringTopic_B_index"
  ON "_MentorProfileToMentoringTopic" ("B");

INSERT INTO "Technology" ("name")
SELECT DISTINCT BTRIM(names.tech_name)
FROM (
  SELECT UNNEST(programming_languages) AS tech_name FROM user_profiles
  UNION
  SELECT UNNEST(tech_stack) AS tech_name FROM user_profiles
) AS names
WHERE names.tech_name IS NOT NULL AND BTRIM(names.tech_name) <> ''
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "_TechnologyToUser" ("A", "B")
SELECT DISTINCT technology.id, profile.user_id
FROM user_profiles AS profile
CROSS JOIN LATERAL UNNEST(profile.programming_languages || profile.tech_stack) AS tech_name
JOIN "Technology" AS technology ON technology.name = BTRIM(tech_name)
ON CONFLICT DO NOTHING;

INSERT INTO "MentoringTopic" ("name")
SELECT DISTINCT BTRIM(topic_name)
FROM mentor_profiles
CROSS JOIN LATERAL UNNEST(advice_topics) AS topic_name
WHERE topic_name IS NOT NULL AND BTRIM(topic_name) <> ''
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "_MentorProfileToMentoringTopic" ("A", "B")
SELECT DISTINCT mentor.id, topic.id
FROM mentor_profiles AS mentor
CROSS JOIN LATERAL UNNEST(mentor.advice_topics) AS topic_name
JOIN "MentoringTopic" AS topic ON topic.name = BTRIM(topic_name)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mentorme_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mentorme_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mentorme_app';
  END IF;
END
$$;
