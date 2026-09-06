-- CreateEnum
CREATE TYPE "MentoringRequestStatus" AS ENUM ('WAITING_FOR_MENTOR_SLOTS', 'WAITING_FOR_MENTEE_SELECTION', 'REJECTED', 'MATCHED', 'ATTENDANCE_CONFIRMED', 'COMPLETED', 'NOT_COMPLETED', 'FEEDBACK_COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchedulingRoundType" AS ENUM ('INITIAL', 'EXTRA_SLOTS', 'RESCHEDULE_BEFORE_MEETING', 'RESCHEDULE_AFTER_NO_SHOW');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'ATTENDANCE_CONFIRMED', 'COMPLETED', 'NOT_COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTORING_REQUEST_RECEIVED', 'REQUEST_REJECTED', 'SLOTS_AVAILABLE', 'MEETING_MATCHED', 'RESCHEDULE_REQUIRED', 'MEETING_REMINDER', 'ATTENDANCE_CONFIRMATION_REQUEST', 'POST_MEETING_CHECK', 'FEEDBACK_REMINDER', 'MENTOR_THANK_YOU');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "workplace" TEXT,
    "yearsOfExperience" INTEGER,
    "profileImageUrl" TEXT,
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "phoneNumber" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technology" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "background" TEXT NOT NULL,
    "meetingCapacity" INTEGER NOT NULL,
    "meetingDurationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentoringTopic" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MentoringTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentoringRequest" (
    "id" SERIAL NOT NULL,
    "menteeId" INTEGER NOT NULL,
    "mentorProfileId" INTEGER NOT NULL,
    "status" "MentoringRequestStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentoringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingRound" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "type" "SchedulingRoundType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferedSlot" (
    "id" SERIAL NOT NULL,
    "schedulingRoundId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "selectedSlotId" INTEGER,
    "attemptNumber" INTEGER NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "MeetingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceConfirmation" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingOutcomeConfirmation" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "occurred" BOOLEAN NOT NULL,
    "wantsReschedule" BOOLEAN,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingOutcomeConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "requestId" INTEGER,
    "meetingId" INTEGER,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TechnologyToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_TechnologyToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MentorProfileToMentoringTopic" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_MentorProfileToMentoringTopic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Technology_name_key" ON "Technology"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MentorProfile_userId_key" ON "MentorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MentoringTopic_name_key" ON "MentoringTopic"("name");

-- CreateIndex
CREATE INDEX "MentoringRequest_status_idx" ON "MentoringRequest"("status");

-- CreateIndex
CREATE INDEX "MentoringRequest_menteeId_idx" ON "MentoringRequest"("menteeId");

-- CreateIndex
CREATE INDEX "MentoringRequest_mentorProfileId_idx" ON "MentoringRequest"("mentorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingRound_requestId_roundNumber_key" ON "SchedulingRound"("requestId", "roundNumber");

-- CreateIndex
CREATE INDEX "OfferedSlot_schedulingRoundId_idx" ON "OfferedSlot"("schedulingRoundId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_selectedSlotId_key" ON "Meeting"("selectedSlotId");

-- CreateIndex
CREATE INDEX "Meeting_scheduledStart_idx" ON "Meeting"("scheduledStart");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_requestId_attemptNumber_key" ON "Meeting"("requestId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceConfirmation_meetingId_userId_key" ON "AttendanceConfirmation"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingOutcomeConfirmation_meetingId_userId_key" ON "MeetingOutcomeConfirmation"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_meetingId_authorId_key" ON "Feedback"("meetingId", "authorId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_scheduledAt_idx" ON "Notification"("scheduledAt");

-- CreateIndex
CREATE INDEX "_TechnologyToUser_B_index" ON "_TechnologyToUser"("B");

-- CreateIndex
CREATE INDEX "_MentorProfileToMentoringTopic_B_index" ON "_MentorProfileToMentoringTopic"("B");

-- AddForeignKey
ALTER TABLE "MentorProfile" ADD CONSTRAINT "MentorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentoringRequest" ADD CONSTRAINT "MentoringRequest_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentoringRequest" ADD CONSTRAINT "MentoringRequest_mentorProfileId_fkey" FOREIGN KEY ("mentorProfileId") REFERENCES "MentorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRound" ADD CONSTRAINT "SchedulingRound_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MentoringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferedSlot" ADD CONSTRAINT "OfferedSlot_schedulingRoundId_fkey" FOREIGN KEY ("schedulingRoundId") REFERENCES "SchedulingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MentoringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_selectedSlotId_fkey" FOREIGN KEY ("selectedSlotId") REFERENCES "OfferedSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceConfirmation" ADD CONSTRAINT "AttendanceConfirmation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceConfirmation" ADD CONSTRAINT "AttendanceConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingOutcomeConfirmation" ADD CONSTRAINT "MeetingOutcomeConfirmation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingOutcomeConfirmation" ADD CONSTRAINT "MeetingOutcomeConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MentoringRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TechnologyToUser" ADD CONSTRAINT "_TechnologyToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Technology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TechnologyToUser" ADD CONSTRAINT "_TechnologyToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MentorProfileToMentoringTopic" ADD CONSTRAINT "_MentorProfileToMentoringTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "MentorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MentorProfileToMentoringTopic" ADD CONSTRAINT "_MentorProfileToMentoringTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "MentoringTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
