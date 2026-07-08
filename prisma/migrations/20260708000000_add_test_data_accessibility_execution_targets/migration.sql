-- Section 1a/1b/1c — Test Data Manager, Accessibility Audit, Execution Targets

-- ── Column additions on existing tables
ALTER TABLE "TestScript" ADD COLUMN "accessibilityEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TestExecution" ADD COLUMN "executionTarget" TEXT;

-- ── 1a: external SHAFT test data files
CREATE TABLE "TestDataFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "jsonSchema" JSONB,
    "linkedScriptIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestDataFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestDataFile_fileName_key" ON "TestDataFile"("fileName");

-- ── 1b: WCAG accessibility audit results
CREATE TABLE "AccessibilityResult" (
    "id" TEXT NOT NULL,
    "testExecutionId" TEXT NOT NULL,
    "scriptId" TEXT,
    "wcagLevel" TEXT NOT NULL,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "violations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessibilityResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessibilityResult_testExecutionId_key" ON "AccessibilityResult"("testExecutionId");
CREATE INDEX "AccessibilityResult_scriptId_idx" ON "AccessibilityResult"("scriptId");

-- ── 1c: remote/Docker/Grid execution targets
CREATE TABLE "ExecutionTarget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT 'Linux',
    "browser" TEXT NOT NULL DEFAULT 'chrome',
    "headless" BOOLEAN NOT NULL DEFAULT false,
    "credentials" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionTarget_pkey" PRIMARY KEY ("id")
);
