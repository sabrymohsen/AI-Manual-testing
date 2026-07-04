-- Add per-bug OpenProject board placement reference
ALTER TABLE "BugReport" ADD COLUMN "openProjectBoardId" TEXT;
