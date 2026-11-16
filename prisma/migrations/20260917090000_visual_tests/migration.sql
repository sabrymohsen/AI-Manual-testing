-- Visual tests: whole-site / URL-list screenshot comparison with approved
-- baselines, a review queue, and flow checkpoints.
--
-- Purely additive: new enums and tables, no column on an existing table changes.
-- Deploys run `prisma db push` (see Dockerfile), so this file documents the
-- change rather than applying it. Written to be safely re-runnable.

DO $$ BEGIN CREATE TYPE "VisualTestType" AS ENUM ('FullWebsite', 'UrlList', 'Flow'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VisualMatchLevel" AS ENUM ('Strict', 'Dynamic', 'IgnoreColors'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VisualCaptureType" AS ENUM ('FullPage', 'Viewport'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VisualRunStatus" AS ENUM ('Queued', 'Running', 'Completed', 'Failed', 'Cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VisualOutcome" AS ENUM ('Passed', 'Unresolved', 'Failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VisualScreenStatus" AS ENUM ('New', 'Passed', 'Unresolved', 'Accepted', 'Rejected', 'Error', 'Removed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VisualScreenDiffState" AS ENUM ('Added', 'Existing', 'Removed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "VisualTest" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "type" "VisualTestType" NOT NULL,
  "startUrl" TEXT NOT NULL,
  "sitemapUrl" TEXT,
  "maxUrls" INTEGER NOT NULL DEFAULT 100,
  "excludedFolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "testCaseId" TEXT UNIQUE REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "suiteId" TEXT REFERENCES "TestSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "credentialId" TEXT REFERENCES "ProjectCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "environments" JSONB NOT NULL,
  "matchLevel" "VisualMatchLevel" NOT NULL DEFAULT 'Strict',
  "captureType" "VisualCaptureType" NOT NULL DEFAULT 'FullPage',
  "waitBeforeCaptureMs" INTEGER NOT NULL DEFAULT 0,
  "beforeCaptureScript" TEXT,
  "autoMaintenance" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "VisualTest_projectId_idx" ON "VisualTest"("projectId");
CREATE INDEX IF NOT EXISTS "VisualTest_suiteId_idx" ON "VisualTest"("suiteId");

CREATE TABLE IF NOT EXISTS "VisualTestPage" (
  "id" TEXT PRIMARY KEY,
  "visualTestId" TEXT NOT NULL REFERENCES "VisualTest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "url" TEXT NOT NULL,
  "urlKey" TEXT NOT NULL,
  "folder" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "excluded" BOOLEAN NOT NULL DEFAULT false,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisualTestPage_visualTestId_urlKey_key" ON "VisualTestPage"("visualTestId", "urlKey");
CREATE INDEX IF NOT EXISTS "VisualTestPage_visualTestId_excluded_idx" ON "VisualTestPage"("visualTestId", "excluded");

CREATE TABLE IF NOT EXISTS "VisualTestRun" (
  "id" TEXT PRIMARY KEY,
  "visualTestId" TEXT NOT NULL REFERENCES "VisualTest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "testRunId" TEXT REFERENCES "TestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" "VisualRunStatus" NOT NULL DEFAULT 'Queued',
  "outcome" "VisualOutcome",
  "environments" JSONB NOT NULL,
  "matchLevel" "VisualMatchLevel" NOT NULL,
  "captureType" "VisualCaptureType" NOT NULL,
  "totalScreens" INTEGER NOT NULL DEFAULT 0,
  "doneScreens" INTEGER NOT NULL DEFAULT 0,
  "passedCount" INTEGER NOT NULL DEFAULT 0,
  "unresolvedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "newCount" INTEGER NOT NULL DEFAULT 0,
  "addedPages" INTEGER NOT NULL DEFAULT 0,
  "removedPages" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "triggeredById" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VisualTestRun_visualTestId_createdAt_idx" ON "VisualTestRun"("visualTestId", "createdAt");
CREATE INDEX IF NOT EXISTS "VisualTestRun_projectId_createdAt_idx" ON "VisualTestRun"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "VisualTestRun_testRunId_idx" ON "VisualTestRun"("testRunId");

CREATE TABLE IF NOT EXISTS "VisualScreen" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL REFERENCES "VisualTestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "visualTestId" TEXT NOT NULL REFERENCES "VisualTest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pageId" TEXT REFERENCES "VisualTestPage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "screenKey" TEXT NOT NULL,
  "url" TEXT,
  "stepId" TEXT,
  "envKey" TEXT NOT NULL,
  "envName" TEXT NOT NULL,
  "browser" TEXT NOT NULL,
  "viewport" TEXT NOT NULL,
  "status" "VisualScreenStatus" NOT NULL,
  "diffState" "VisualScreenDiffState" NOT NULL DEFAULT 'Existing',
  "httpStatus" INTEGER,
  "errorMessage" TEXT,
  "loadMs" INTEGER,
  "actualImagePath" TEXT,
  "baselineImagePath" TEXT,
  "diffImagePath" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "mismatchPercent" DOUBLE PRECISION,
  "diffRegions" JSONB,
  "dynamicRects" JSONB,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByAuto" BOOLEAN NOT NULL DEFAULT false,
  "autoFromScreenId" TEXT,
  "bugReportId" TEXT REFERENCES "BugReport"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "VisualScreen_runId_idx" ON "VisualScreen"("runId");
CREATE INDEX IF NOT EXISTS "VisualScreen_visualTestId_status_idx" ON "VisualScreen"("visualTestId", "status");
CREATE INDEX IF NOT EXISTS "VisualScreen_visualTestId_screenKey_envKey_idx" ON "VisualScreen"("visualTestId", "screenKey", "envKey");
CREATE INDEX IF NOT EXISTS "VisualScreen_autoFromScreenId_idx" ON "VisualScreen"("autoFromScreenId");

CREATE TABLE IF NOT EXISTS "VisualScreenBaseline" (
  "id" TEXT PRIMARY KEY,
  "visualTestId" TEXT NOT NULL REFERENCES "VisualTest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "screenKey" TEXT NOT NULL,
  "envKey" TEXT NOT NULL,
  "imagePath" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "dynamicRects" JSONB,
  "sourceScreenId" TEXT,
  "previousImagePath" TEXT,
  "previousWidth" INTEGER,
  "previousHeight" INTEGER,
  "previousDynamicRects" JSONB,
  "previousSourceScreenId" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisualScreenBaseline_visualTestId_screenKey_envKey_key" ON "VisualScreenBaseline"("visualTestId", "screenKey", "envKey");

CREATE TABLE IF NOT EXISTS "VisualTestRegion" (
  "id" TEXT PRIMARY KEY,
  "visualTestId" TEXT NOT NULL REFERENCES "VisualTest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "screenKey" TEXT,
  "envKey" TEXT,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VisualTestRegion_visualTestId_idx" ON "VisualTestRegion"("visualTestId");
