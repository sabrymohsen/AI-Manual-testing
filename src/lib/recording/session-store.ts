import { prisma } from "@/lib/db"

export async function getSessionStats(sessionId: string) {
  const cases = await prisma.recordedTestCase.findMany({
    where: { sessionId },
    include: { steps: true },
  })

  const savedCount = cases.filter((c) => c.status === "SavedAsTestCase").length
  const draftCases = cases.filter((c) => c.status === "Draft")
  const draftCount = draftCases.length
  const draftStepCount = draftCases.reduce((acc, c) => acc + c.steps.length, 0)

  return {
    savedCount,
    draftCount,
    draftStepCount,
  }
}

export async function saveRecordedCaseAsTestCase(recordedTestCaseId: string) {
  const draft = await prisma.recordedTestCase.findUnique({
    where: { id: recordedTestCaseId },
    include: {
      steps: {
        where: { includeInFinalTestCase: true },
        orderBy: { stepNumber: "asc" },
      },
      session: true,
    },
  })

  if (!draft) throw new Error("Draft recorded test case not found")

  // Idempotency guard — if already saved, return the existing TestCase
  if (draft.status === "SavedAsTestCase" && draft.finalTestCaseId) {
    const existing = await prisma.testCase.findUnique({ where: { id: draft.finalTestCaseId } })
    if (existing) return existing
  }

  const realTestCase = await prisma.testCase.create({
    data: {
      projectId: draft.session.projectId,
      title: draft.title,
      module: draft.module || "General",
      moduleId: draft.moduleId,
      featureId: draft.featureId,
      componentId: draft.componentId,
      priority: draft.priority,
      preconditions: draft.preconditions,
      requiredCredentialId: draft.requiredCredentialId,
      source: "Recorder",
      executionType: "Automated",
      steps: {
        create: draft.steps.map((step, idx) => ({
          stepNumber: idx + 1,
          actionDescription: step.actionDescription,
          expectedResult: step.expectedResult || "Action completes successfully",
          actionType: step.actionType,
          targetType: step.targetType,
          targetValue: step.targetValue,
          inputValue: step.inputValue,
          timeoutMs: 10000,
          assertions: step.assertions || [],
          componentType: step.componentType,
          groupId: step.groupId,
          rawEvents: step.rawEvents || undefined,
          actionMetadata: step.actionMetadata || undefined,
          locatorCandidates: step.locatorCandidates || step.alternativeLocators || undefined,
          selectedOptionText: step.selectedOptionText,
          selectedOptionValue: step.selectedOptionValue,
          validationStatus: step.validationStatus,
          validationMessage: step.validationMessage,
        })),
      },
    },
  })

  await prisma.recordedTestCase.update({
    where: { id: recordedTestCaseId },
    data: {
      status: "SavedAsTestCase",
      finalTestCaseId: realTestCase.id,
      savedAt: new Date(),
    },
  })

  return realTestCase
}
