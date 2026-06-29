-- AlterTable: add auto-captured live-session context columns (Testing Workstation)
ALTER TABLE "BugReport" ADD COLUMN "pageUrl" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "osInfo" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "screenResolution" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "videoUrl" TEXT;
