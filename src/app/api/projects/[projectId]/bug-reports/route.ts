import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const severity = searchParams.get("severity")
  const priority = searchParams.get("priority")

  const bugReports = await prisma.bugReport.findMany({
    where: {
      OR: [
        { testRun: { projectId: params.projectId } },
        { manualTestSession: { projectId: params.projectId } }
      ],
      ...(severity ? { severity: severity as any } : {}),
      ...(priority ? { priority: priority as any } : {}),
    },
    include: {
      testRun: {
        select: { id: true, status: true, browserType: true },
      },
      manualTestSession: {
        select: { id: true, name: true, browserType: true }
      }
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ bugReports })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()

  // Get test run or manual session to populate environment/browser/viewport
  let env = "Staging"
  let roleUsed = "None"
  let browser = "Chromium"
  let viewport = "Desktop"

  let testCaseId: string | null = null

  if (body.testRunId) {
    const testRun = await prisma.testRun.findFirst({
      where: { id: body.testRunId, projectId: params.projectId },
      include: { project: true }
    })
    if (testRun) {
      env = testRun.project.environment
      roleUsed = testRun.roleUsed
      browser = testRun.browserType
      viewport = testRun.viewport
      testCaseId = testRun.testCaseId
    }
  } else if (body.manualTestSessionId) {
    const manualSession = await prisma.manualTestSession.findFirst({
      where: { id: body.manualTestSessionId, projectId: params.projectId }
    })
    if (manualSession) {
      env = manualSession.environment
      roleUsed = manualSession.credentialId ? "Authenticated User" : "None"
      browser = manualSession.browserType
      viewport = manualSession.viewport
    }
  }

  if (body.testCaseId) {
    testCaseId = body.testCaseId
  }

  // Inherit linked requirements from the test case
  let requirementIds: string[] = []
  if (testCaseId) {
    const tcRequirements = await prisma.testCaseRequirement.findMany({
      where: { testCaseId }
    })
    requirementIds = tcRequirements.map((r) => r.requirementId)
  }

  const bugReport = await prisma.bugReport.create({
    data: {
      title: body.title,
      severity: body.severity || "Medium",
      priority: body.priority || "Medium",
      environment: env as any,
      roleUsed,
      stepsToReproduce: body.stepsToReproduce || "",
      expectedResult: body.expectedResult || "",
      actualResult: body.actualResult || "",
      screenshotPath: body.screenshotPath || null,
      consoleLogs: body.consoleLogs || null,
      networkErrors: body.networkErrors || null,
      browser: browser as any,
      viewport: viewport as any,
      testRunId: body.testRunId || null,
      manualTestSessionId: body.manualTestSessionId || null,
      requirements: requirementIds.length > 0
        ? {
            create: requirementIds.map((reqId) => ({
              requirementId: reqId
            }))
          }
        : undefined
    },
  })

  return NextResponse.json({ bugReport }, { status: 201 })
}
