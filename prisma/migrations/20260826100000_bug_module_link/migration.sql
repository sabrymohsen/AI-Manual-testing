-- Link a bug to the module/service (TestSuite) it belongs to.
--
-- Additive and nullable: every existing bug simply has no module until it is
-- set by hand, by the auto-fill on create, or by the one-off backfill in
-- scripts/backfill-bug-suites.ts. NULL means "Unfiled", never "unknown module".
--
-- ON DELETE SET NULL, because deleting a suite must not delete its defects —
-- the same rule TestCase.suiteId already follows.

ALTER TABLE "BugReport"
  ADD COLUMN IF NOT EXISTS "suiteId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BugReport_suiteId_fkey'
  ) THEN
    ALTER TABLE "BugReport"
      ADD CONSTRAINT "BugReport_suiteId_fkey"
      FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BugReport_suiteId_idx" ON "BugReport" ("suiteId");
CREATE INDEX IF NOT EXISTS "BugReport_projectId_suiteId_idx" ON "BugReport" ("projectId", "suiteId");
