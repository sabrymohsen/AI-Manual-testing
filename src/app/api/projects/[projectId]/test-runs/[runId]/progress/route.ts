import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const testRun = await prisma.testRun.findUnique({
    where: { id: params.runId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
    },
  })

  if (!testRun) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 })
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
