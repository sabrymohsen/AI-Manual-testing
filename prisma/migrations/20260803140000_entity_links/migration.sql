-- Generic cross-entity linking.
--
-- Purpose-built link tables (TaskTestCase, TaskBug, BrdLink) keep their own
-- semantics; this is the fallback for every entity pair that has no dedicated
-- table, so traceability doesn't need a new join table per combination.
--
-- Additive only — no existing table is touched.
--
-- NOTE: deployed containers run `prisma db push` from schema.prisma rather than
-- `migrate deploy` (see Dockerfile), so this file is for local/manual use and as
-- a record of the change. db push produces the same result.

CREATE TYPE "LinkableEntityType" AS ENUM (
  'TASK', 'BUG_REPORT', 'TEST_CASE', 'TEST_RUN', 'BRD_DOCUMENT',
  'REQUIREMENT', 'SPRINT', 'EPIC', 'MANUAL_TEST_SESSION'
);

CREATE TABLE "EntityLink" (
  "id"            TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "sourceId"      TEXT NOT NULL,
  "sourceType"    "LinkableEntityType" NOT NULL,
  "targetId"      TEXT NOT NULL,
  "targetType"    "LinkableEntityType" NOT NULL,
  "relationLabel" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"     TEXT,
  CONSTRAINT "EntityLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EntityLink_projectId_idx" ON "EntityLink"("projectId");
CREATE INDEX "EntityLink_sourceId_sourceType_idx" ON "EntityLink"("sourceId", "sourceType");
CREATE INDEX "EntityLink_targetId_targetType_idx" ON "EntityLink"("targetId", "targetType");

-- One link per direction per relationship label.
CREATE UNIQUE INDEX "EntityLink_sourceId_sourceType_targetId_targetType_relation_key"
  ON "EntityLink"("sourceId", "sourceType", "targetId", "targetType", "relationLabel");

ALTER TABLE "EntityLink" ADD CONSTRAINT "EntityLink_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
