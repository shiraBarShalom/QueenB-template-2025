-- Admin dashboard support. Purely additive:
--   * User.isActive / User.onboardingComplete  (defaulted, so existing rows fill in)
--   * MentorProfile.*  gain DB defaults (columns stay NOT NULL)
--   * PasswordResetToken  (new table)
--   * session  (already created at runtime by connect-pg-simple; recorded here
--               with IF NOT EXISTS guards so `prisma migrate` no longer sees it
--               as drift and never proposes dropping it)
-- No existing column/table/relation is dropped or altered destructively.

-- AlterTable
ALTER TABLE "MentorProfile" ALTER COLUMN "background" SET DEFAULT '',
ALTER COLUMN "meetingCapacity" SET DEFAULT 3,
ALTER COLUMN "meetingDurationMinutes" SET DEFAULT 60;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable (connect-pg-simple session store; created at runtime, guarded here)
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session"("expire");

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
