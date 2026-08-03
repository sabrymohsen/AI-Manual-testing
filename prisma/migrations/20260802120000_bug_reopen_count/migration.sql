-- Reopen counting on bug reports.
--
-- `Reopened` already existed as a BugStatus, but a status only records where a
-- bug is *now*. It can't distinguish a defect reopened once from one that has
-- failed verification three times — which is the difference between a normal
-- fix cycle and a defect that isn't understood.
--
-- Additive and defaulted, so it's safe to apply to a populated database.
--
-- NOTE: the deployed containers run `prisma db push` from schema.prisma rather
-- than `migrate deploy` (see Dockerfile), so this file is for local/manual use
-- and as a record of the change. db push will add the same column.
ALTER TABLE "BugReport" ADD COLUMN "reopenCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the activity log: each recorded transition INTO Reopened counts
-- as one reopen. Bugs currently sitting in Reopened with no logged history get
-- at least 1, so they don't read as never-reopened.
UPDATE "BugReport" b
SET "reopenCount" = GREATEST(
  (
    SELECT COUNT(*)
    FROM "BugActivity" a
    WHERE a."bugId" = b."id"
      AND a."action" = 'Status Changed'
      AND a."details" ILIKE '%to Reopened%'
  ),
  CASE WHEN b."status" = 'Reopened' THEN 1 ELSE 0 END
);

-- Finding the repeat offenders is the whole point of the column.
CREATE INDEX "BugReport_projectId_reopenCount_idx" ON "BugReport"("projectId", "reopenCount");
