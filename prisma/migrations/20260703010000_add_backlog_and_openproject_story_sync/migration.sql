-- AlterEnum
ALTER TYPE "RequirementSource" ADD VALUE 'OpenProject';

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "backlogRank" INTEGER;

-- AlterTable
ALTER TABLE "OpenProjectIntegration" ADD COLUMN "userStoryTypeId" TEXT;
