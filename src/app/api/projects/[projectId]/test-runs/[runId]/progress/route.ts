import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const testRun = await prisma.testRun.findFirst({
    where: { id: params.runId, projectId: params.projectId },

    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
    },
  })

  if (!testRun) {
    return notFoundResponse("Test run not found")
  }

  const stepResults = await prisma.testStepResult.findMany({
    where: { testRunId: params.runId },
    orderBy: { stepNumber: "asc" },
    select: {
      id: true,
      stepNumber: true,
      actionDescription: true,
      expectedResult: true,
      status: true,
      actualResult: true,
      errorDetails: true,
      durationMs: true,
      screenshotBefore: true,
      screenshotAfter: true,
      actionMetadata: true,
    },
  })

  const currentStep = stepResults.find((s) => s.status === "Running")

  return NextResponse.json({
    status: testRun.status,
    currentStep: currentStep?.stepNumber || null,
    stepResults,
    startedAt: testRun.startedAt,
    completedAt: testRun.completedAt,
    durationMs: testRun.durationMs,
  })
}
