-- Add per-bug OpenProject parent work package reference
ALTER TABLE "BugReport" ADD COLUMN "openProjectParentId" TEXT;
