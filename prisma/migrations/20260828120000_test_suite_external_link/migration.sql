-- Link a module (TestSuite) to an Epic/Feature in the project's tracker.
--
-- Additive and nullable: a module created by hand keeps every column NULL and
-- behaves exactly as before. Only container types (Epic, Feature) are ever
-- linked, so nothing here implies a Story or Task can become a module.
--
-- Note: deploys run `prisma db push` (see Dockerfile), so this file documents
-- the change rather than applying it. It is written to be safely re-runnable.

ALTER TABLE "TestSuite"
  ADD COLUMN IF NOT EXISTS "externalProvider" "ExternalProvider",
  ADD COLUMN IF NOT EXISTS "externalId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalType" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "externalSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TestSuite_projectId_externalProvider_externalId_idx"
  ON "TestSuite" ("projectId", "externalProvider", "externalId");
