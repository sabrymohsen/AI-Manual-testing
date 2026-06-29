-- CreateEnum
CREATE TYPE "ExecutionType" AS ENUM ('Manual', 'Automated');

-- AlterTable: add column with default so all existing rows get 'Manual'
ALTER TABLE "TestCase" ADD COLUMN "executionType" "ExecutionType" NOT NULL DEFAULT 'Manual';

-- Backfill: Recorder-sourced cases → Automated
UPDATE "TestCase" SET "executionType" = 'Automated' WHERE "source" = 'Recorder';

-- CreateIndex
CREATE INDEX "TestCase_executionType_idx" ON "TestCase"("executionType");
