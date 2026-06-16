-- CreateTable
CREATE TABLE "ElementLocator" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "description" TEXT,
    "pageUrl" TEXT NOT NULL,
    "tagName" TEXT,
    "visibleText" TEXT,
    "locatorType" "TargetType" NOT NULL,
    "locatorValue" TEXT NOT NULL,
    "recommendedSelector" TEXT,
    "cssSelector" TEXT,
    "xpathSelector" TEXT,
    "idSelector" TEXT,
    "testIdSelector" TEXT,
    "roleSelector" TEXT,
    "textSelector" TEXT,
    "labelSelector" TEXT,
    "placeholderSelector" TEXT,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "screenshotPath" TEXT,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "matchCount" INTEGER,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementLocator_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ElementLocator" ADD CONSTRAINT "ElementLocator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
