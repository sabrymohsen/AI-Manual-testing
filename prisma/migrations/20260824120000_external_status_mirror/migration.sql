-- Mirror the tracker's own status on each synced item.
--
-- Nullable and additive: existing rows simply have no external status until the
-- next inbound poll/webhook fills it in, and every read path treats NULL as
-- "the tracker has not told us yet" rather than as a status.

ALTER TABLE "ExternalSyncMapping"
  ADD COLUMN IF NOT EXISTS "externalStatusId"   TEXT,
  ADD COLUMN IF NOT EXISTS "externalStatusName" TEXT,
  ADD COLUMN IF NOT EXISTS "externalStatusAt"   TIMESTAMP(3);

-- Board rendering groups bugs by (project, entity type, external status).
CREATE INDEX IF NOT EXISTS "ExternalSyncMapping_projectId_localEntityType_externalStatusId_idx"
  ON "ExternalSyncMapping" ("projectId", "localEntityType", "externalStatusId");
