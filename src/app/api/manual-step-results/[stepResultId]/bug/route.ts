import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: { stepResultId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      title,
      severity,
      priority,
      stepsToReproduce,
      expectedResult,
      actualResult,
      screenshotPath,
      consoleLogs,
      networkErrors
    } = body

    const stepResult = await prisma.manualStepResult.findUnique({
      where: { id: params.stepResultId },
      include: {
        sessionCase: {
          include: {
            session: true,
            testCase: true
          }
        }
      }
    })

    if (!stepResult || !stepResult.sessionCase) {
      return NextResponse.json({ error: "Manual step result not found" }, { status: 404 })
    }

    const manualSession = stepResult.sessionCase.session
    const testCaseId = stepResult.sessionCase.testCaseId

    // Inherit linked requirements from the manual session test case
    let requirementIds: string[] = []
    if (testCaseId) {
      const tcRequirements = await prisma.testCaseRequirement.findMany({
        where: { testCaseId }
      })
      requirementIds = tcRequirements.map((r) => r.requirementId)
    }

    const bugReport = await prisma.bugReport.create({
      data: {
        title: title || `Failed: ${stepResult.sessionCase.testCase.title} - Step ${stepResult.stepNumber}`,
        severity: severity || "High",
        priority: priority || "High",
        environment: manualSession.environment,
        roleUsed: manualSession.credentialId ? "Authenticated User" : "None",
        stepsToReproduce: stepsToReproduce || `1. Open app.\n2. Execute: ${stepResult.sessionCase.testCase.title}\n3. Go to step ${stepResult.stepNumber}: ${stepResult.actionDescription}`,
        expectedResult: expectedResult || stepResult.expectedResult || "",
        actualResult: actualResult || stepResult.actualResult || "",
        screenshotPath: screenshotPath || stepResult.screenshotPath,
        consoleLogs: consoleLogs || "",
        networkErrors: networkErrors || "",
        browser: manualSession.browserType,
        viewport: manualSession.viewport,
        manualTestSessionId: manualSession.id,
        requirements: requirementIds.length > 0
          ? {
              create: requirementIds.map((reqId) => ({
                requirementId: reqId
              }))
            }
          : undefined
      }
    })

    // Link bug report to manual step result
    await prisma.manualStepResult.update({
      where: { id: params.stepResultId },
      data: {
        bugReportId: bugReport.id
      }
    })

    return NextResponse.json(bugReport, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create bug report" }, { status: 500 })
  }
}
