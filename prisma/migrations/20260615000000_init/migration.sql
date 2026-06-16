-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('Dev', 'Staging', 'UAT', 'Production');
CREATE TYPE "BrowserType" AS ENUM ('Chromium', 'Firefox', 'WebKit');
CREATE TYPE "ViewportType" AS ENUM ('Desktop', 'Tablet', 'Mobile', 'Custom');
CREATE TYPE "TestType" AS ENUM ('Functional', 'VisualDesign', 'E2E', 'Regression', 'Smoke', 'Exploratory');
CREATE TYPE "Priority" AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE "TestRunStatus" AS ENUM ('Queued', 'Running', 'Passed', 'Failed', 'Blocked', 'Warning', 'Cancelled');
CREATE TYPE "StepStatus" AS ENUM ('Pending', 'Running', 'Passed', 'Failed', 'Blocked', 'Warning', 'Skipped');
CREATE TYPE "TestCaseSource" AS ENUM ('Manual', 'AIGenerated', 'Imported', 'Exploratory');
CREATE TYPE "ActionType" AS ENUM ('open_url', 'click', 'fill', 'select', 'upload_file', 'wait_for_text', 'wait_for_url', 'assert_visible', 'assert_hidden', 'assert_text', 'assert_url', 'assert_api_status', 'screenshot', 'custom_instruction');
CREATE TYPE "TargetType" AS ENUM ('test_id', 'role', 'text', 'label', 'placeholder', 'css', 'xpath', 'url', 'none');
CREATE TYPE "LogLevel" AS ENUM ('info', 'warning', 'error', 'debug');
CREATE TYPE "LogSource" AS ENUM ('browser', 'server', 'playwright', 'ai', 'network');
CREATE TYPE "JobStatus" AS ENUM ('Queued', 'Running', 'Completed', 'Failed', 'Cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webAppUrl" TEXT NOT NULL,
    "figmaUrl" TEXT,
    "description" TEXT,
    "environment" "Environment" NOT NULL DEFAULT 'Staging',
    "browserType" "BrowserType" NOT NULL DEFAULT 'Chromium',
    "viewport" "ViewportType" NOT NULL DEFAULT 'Desktop',
    "testType" "TestType" NOT NULL DEFAULT 'Functional',
    "customViewportWidth" INTEGER,
    "customViewportHeight" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectCredential" (
    "id" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionAuthTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'v1',
    "loginUrl" TEXT,
    "notes" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FigmaConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "encryptedApiToken" TEXT,
    "encryptionIv" TEXT,
    "encryptionAuthTag" TEXT,
    "keyVersion" TEXT NOT NULL DEFAULT 'v1',
    "fileKey" TEXT,
    "nodeId" TEXT,
    "visualTolerancePercent" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastFetchedAt" TIMESTAMP(3),
    CONSTRAINT "FigmaConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FigmaConfig_projectId_key" ON "FigmaConfig"("projectId");

CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'Medium',
    "preconditions" TEXT,
    "source" "TestCaseSource" NOT NULL DEFAULT 'Manual',
    "requiredCredentialId" TEXT,
    "testData" JSONB,
    "tags" TEXT[],
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestStep" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "actionDescription" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL DEFAULT 'custom_instruction',
    "targetType" "TargetType" NOT NULL DEFAULT 'none',
    "targetValue" TEXT,
    "inputValue" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "assertions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "credentialId" TEXT,
    "status" "TestRunStatus" NOT NULL DEFAULT 'Queued',
    "roleUsed" TEXT NOT NULL DEFAULT 'None',
    "browserType" "BrowserType" NOT NULL,
    "viewport" "ViewportType" NOT NULL,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "triggeredBy" "TestCaseSource" NOT NULL DEFAULT 'Manual',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestJob" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'Queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "TestJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestJob_testRunId_key" ON "TestJob"("testRunId");

CREATE TABLE "TestStepResult" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "testStepId" TEXT,
    "stepNumber" INTEGER NOT NULL,
    "actionDescription" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "actualResult" TEXT,
    "status" "StepStatus" NOT NULL DEFAULT 'Pending',
    "screenshotBefore" TEXT,
    "screenshotAfter" TEXT,
    "errorDetails" TEXT,
    "notes" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestStepResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "testStepResultId" TEXT,
    "source" "LogSource" NOT NULL,
    "level" "LogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "raw" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NetworkLog" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "testStepResultId" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" INTEGER,
    "error" TEXT,
    "resourceType" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "requestHeaders" JSONB,
    "responseHeaders" JSONB,
    "responseBodyPreview" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisualComparisonResult" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "stepResultId" TEXT,
    "figmaImagePath" TEXT NOT NULL,
    "actualImagePath" TEXT NOT NULL,
    "diffImagePath" TEXT,
    "mismatchPercent" DOUBLE PRECISION NOT NULL,
    "tolerancePercent" DOUBLE PRECISION NOT NULL,
    "viewportWidth" INTEGER NOT NULL,
    "viewportHeight" INTEGER NOT NULL,
    "status" "StepStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualComparisonResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "Priority" NOT NULL,
    "priority" "Priority" NOT NULL,
    "environment" "Environment" NOT NULL,
    "roleUsed" TEXT NOT NULL,
    "stepsToReproduce" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "actualResult" TEXT NOT NULL,
    "screenshotPath" TEXT,
    "consoleLogs" TEXT,
    "networkErrors" TEXT,
    "browser" "BrowserType" NOT NULL,
    "viewport" "ViewportType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "bugReportId" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "credentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCredential" ADD CONSTRAINT "ProjectCredential_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FigmaConfig" ADD CONSTRAINT "FigmaConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_requiredCredentialId_fkey" FOREIGN KEY ("requiredCredentialId") REFERENCES "ProjectCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestStep" ADD CONSTRAINT "TestStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ProjectCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestJob" ADD CONSTRAINT "TestJob_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestStepResult" ADD CONSTRAINT "TestStepResult_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestStepResult" ADD CONSTRAINT "TestStepResult_testStepId_fkey" FOREIGN KEY ("testStepId") REFERENCES "TestStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Log" ADD CONSTRAINT "Log_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Log" ADD CONSTRAINT "Log_testStepResultId_fkey" FOREIGN KEY ("testStepResultId") REFERENCES "TestStepResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NetworkLog" ADD CONSTRAINT "NetworkLog_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NetworkLog" ADD CONSTRAINT "NetworkLog_testStepResultId_fkey" FOREIGN KEY ("testStepResultId") REFERENCES "TestStepResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisualComparisonResult" ADD CONSTRAINT "VisualComparisonResult_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisualComparisonResult" ADD CONSTRAINT "VisualComparisonResult_stepResultId_fkey" FOREIGN KEY ("stepResultId") REFERENCES "TestStepResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ProjectCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
