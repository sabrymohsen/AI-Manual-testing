-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('Free', 'Pro');

-- CreateEnum
CREATE TYPE "SessionRecordingStatus" AS ENUM ('Recording', 'Ready', 'Failed');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "plan" "UserPlan" NOT NULL DEFAULT 'Free';

-- AlterTable
ALTER TABLE "RecordingSession" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'Studio';

-- CreateTable
CREATE TABLE "SessionScreenshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fullPage" BOOLEAN NOT NULL DEFAULT false,
    "pageUrl" TEXT,
    "annotatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRecording" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "filePath" TEXT,
    "status" "SessionRecordingStatus" NOT NULL DEFAULT 'Recording',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionScreenshot_sessionId_idx" ON "SessionScreenshot"("sessionId");

-- CreateIndex
CREATE INDEX "SessionRecording_sessionId_idx" ON "SessionRecording"("sessionId");

-- AddForeignKey
ALTER TABLE "SessionScreenshot" ADD CONSTRAINT "SessionScreenshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecording" ADD CONSTRAINT "SessionRecording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
