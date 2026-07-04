-- CreateEnum
CREATE TYPE "BugResolution" AS ENUM ('Fixed', 'WontFix', 'CannotReproduce', 'Duplicate', 'ByDesign');

-- AlterTable
ALTER TABLE "BugReport"
  ADD COLUMN "resolution" "BugResolution",
  ADD COLUMN "resolutionNote" TEXT,
  ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "reporterId" TEXT;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
