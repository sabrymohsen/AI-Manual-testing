-- ── Drop old hierarchy FKs + columns (TestCase / BugReport / ElementLocator / Requirement)
ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_moduleId_fkey";
ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_featureId_fkey";
ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_componentId_fkey";
ALTER TABLE "TestCase" DROP COLUMN "moduleId", DROP COLUMN "featureId", DROP COLUMN "componentId", DROP COLUMN "module";

ALTER TABLE "BugReport" DROP CONSTRAINT "BugReport_moduleId_fkey";
ALTER TABLE "BugReport" DROP CONSTRAINT "BugReport_featureId_fkey";
ALTER TABLE "BugReport" DROP CONSTRAINT "BugReport_componentId_fkey";
ALTER TABLE "BugReport" DROP COLUMN "moduleId", DROP COLUMN "featureId", DROP COLUMN "componentId";

ALTER TABLE "ElementLocator" DROP CONSTRAINT "ElementLocator_moduleId_fkey";
ALTER TABLE "ElementLocator" DROP CONSTRAINT "ElementLocator_featureId_fkey";
ALTER TABLE "ElementLocator" DROP CONSTRAINT "ElementLocator_componentId_fkey";
ALTER TABLE "ElementLocator" DROP COLUMN "moduleId", DROP COLUMN "featureId", DROP COLUMN "componentId";

ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_moduleId_fkey";
ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_featureId_fkey";
ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_componentId_fkey";
ALTER TABLE "Requirement" DROP COLUMN "moduleId", DROP COLUMN "featureId", DROP COLUMN "componentId";

-- ── Drop old hierarchy tables + module-keyed OpenProject config
DROP TABLE "OpenProjectModuleConfig";
DROP TABLE "ProjectComponent";
DROP TABLE "ProjectFeature";
DROP TABLE "ProjectModule";
DELETE FROM "OpenProjectParentMapping" WHERE "mappingType" = 'Module';

-- ── Create the new Feature layer
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "epicId" TEXT,
    "featureKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Feature_projectId_featureKey_key" ON "Feature"("projectId", "featureKey");
CREATE INDEX "Feature_projectId_idx" ON "Feature"("projectId");
CREATE INDEX "Feature_epicId_idx" ON "Feature"("epicId");
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_epicId_fkey"
    FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Requirement.featureId now points at the NEW Feature
ALTER TABLE "Requirement" ADD COLUMN "featureId" TEXT;
CREATE INDEX "Requirement_featureId_idx" ON "Requirement"("featureId");
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_featureId_fkey"
    FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Feature-keyed OpenProject group-sync config (same overrides as the old module config)
CREATE TABLE "OpenProjectFeatureConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "baseUrl" TEXT,
    "openProjectProjectIdentifier" TEXT,
    "apiTokenEncrypted" TEXT,
    "apiTokenIv" TEXT,
    "apiTokenAuthTag" TEXT,
    "apiTokenKeyVersion" TEXT NOT NULL DEFAULT 'v1',
    "testCaseTypeId" TEXT,
    "passedStatusId" TEXT,
    "failedStatusId" TEXT,
    "blockedStatusId" TEXT,
    "defaultStatusId" TEXT,
    "targetBoardId" TEXT,
    "targetBoardType" TEXT,
    "targetColumnStatusId" TEXT,
    "targetVersionId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenProjectFeatureConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpenProjectFeatureConfig_projectId_featureId_key" ON "OpenProjectFeatureConfig"("projectId", "featureId");
CREATE INDEX "OpenProjectFeatureConfig_projectId_idx" ON "OpenProjectFeatureConfig"("projectId");
