-- CreateEnum
CREATE TYPE "EpicStatus" AS ENUM ('Draft', 'Active', 'Completed', 'Archived');

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "epicKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'Medium',
    "status" "EpicStatus" NOT NULL DEFAULT 'Active',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Epic_projectId_epicKey_key" ON "Epic"("projectId", "epicKey");
CREATE INDEX "Epic_projectId_idx" ON "Epic"("projectId");

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "epicId" TEXT;

-- CreateIndex
CREATE INDEX "Requirement_epicId_idx" ON "Requirement"("epicId");

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_epicId_fkey"
    FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
