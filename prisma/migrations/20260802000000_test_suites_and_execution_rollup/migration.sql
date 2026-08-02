-- Test library rework: real suite ownership + denormalised execution rollup.
--
-- Two independent changes, both additive and nullable/defaulted, so this is
-- safe to apply to a populated database without downtime. Nothing is dropped.
--
--   1. "TestSuite" — the folder tree the library was missing. Previously the
--      left-hand tree was projected from Requirement, which is many-to-many,
--      so a case could appear under two epics and cases with no story link
--      were unreachable.
--   2. Rollup columns on "TestCase" — last execution outcome and open bug
--      count, so the list can filter/sort/paginate in SQL instead of the
--      browser downloading every TestRun in the project.
--
-- Run scripts/backfill-test-suites.ts afterwards to populate both.

-- ── 1. Case-level verdict enum ──────────────────────────────────────────────
-- Deliberately excludes Queued/Running/Pending: an in-flight run must not
-- overwrite the last settled verdict.
CREATE TYPE "TestCaseStatus" AS ENUM ('NotExecuted', 'Passed', 'Failed', 'Blocked', 'Warning', 'Skipped');

-- ── 2. Suite tree ───────────────────────────────────────────────────────────
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSuite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestSuite_projectId_idx" ON "TestSuite"("projectId");
CREATE INDEX "TestSuite_parentId_idx" ON "TestSuite"("parentId");
CREATE INDEX "TestSuite_projectId_parentId_orderIndex_idx" ON "TestSuite"("projectId", "parentId", "orderIndex");

ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a parent suite removes its whole subtree.
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "TestSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. TestCase: filing + execution rollup ──────────────────────────────────
ALTER TABLE "TestCase" ADD COLUMN "suiteId" TEXT;
ALTER TABLE "TestCase" ADD COLUMN "lastStatus" "TestCaseStatus" NOT NULL DEFAULT 'NotExecuted';
ALTER TABLE "TestCase" ADD COLUMN "lastRunAt" TIMESTAMP(3);
ALTER TABLE "TestCase" ADD COLUMN "lastRunId" TEXT;
ALTER TABLE "TestCase" ADD COLUMN "lastRunSource" "ExecutionType";
ALTER TABLE "TestCase" ADD COLUMN "openBugCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "TestCase_suiteId_idx" ON "TestCase"("suiteId");
CREATE INDEX "TestCase_projectId_lastStatus_idx" ON "TestCase"("projectId", "lastStatus");
CREATE INDEX "TestCase_projectId_suiteId_idx" ON "TestCase"("projectId", "suiteId");

-- SetNull, not Cascade: deleting a suite must never delete test cases. They
-- fall back to "Unfiled".
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_suiteId_fkey"
    FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
