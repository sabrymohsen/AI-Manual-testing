-- Store OpenProject required/custom field values for the bug type
ALTER TABLE "BugReport" ADD COLUMN "openProjectCustomFields" JSONB;
