import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createBugReportSchema } from "@/schemas"
import { z } from "zod"

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const bugReportBodySchema = createBugReportSchema.omit({ projectId: true }).extend({
    testRunId: z.string().optional().nullable(),
    manualTestSessionId: z.string().optional().nullable(),
    screenshotPath: z.string().optional().nullable(),
    consoleLogs: z.string().optional().nullable(),
    networkErrors: z.string().optional().nullable(),
  })
  const parsed = bugReportBodySchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }

  // Get test run or manual session to populate environment/browser/viewport
  let env = "Staging"
  let roleUsed = "None"
  let browser = "Chromium"
  let viewport = "Desktop"

  let testCaseId: string | null = null

  if (parsed.data.testRunId) {
    const testRun = await prisma.testRun.findFirst({
      where: { id: parsed.data.testRunId, projectId: params.projectId },
      include: { project: true }
    })
    if (testRun) {
      env = testRun.project.environment
      roleUsed = testRun.roleUsed
      browser = testRun.browserType
      viewport = testRun.viewport
      testCaseId = testRun.testCaseId
    }
  } else if (parsed.data.manualTestSessionId) {
    const manualSession = await prisma.manualTestSession.findFirst({
      where: { id: parsed.data.manualTestSessionId, projectId: params.projectId }
    })
    if (manualSession) {
      env = manualSession.environment
      roleUsed = manualSession.credentialId ? "Authenticated User" : "None"
      browser = manualSession.browserType
      viewport = manualSession.viewport
    }
  }

  if (parsed.data.testCaseId) {
    testCaseId = parsed.data.testCaseId
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
      title: parsed.data.title,
      severity: parsed.data.severity || "Medium",
      priority: parsed.data.priority || "Medium",
      environment: env as any,
      roleUsed,
      stepsToReproduce: parsed.data.stepsToReproduce || "",
      expectedResult: parsed.data.expectedResult || "",
      actualResult: parsed.data.actualResult || "",
      screenshotPath: parsed.data.screenshotPath || null,
      consoleLogs: parsed.data.consoleLogs || null,
      networkErrors: parsed.data.networkErrors || null,
      browser: browser as any,
      viewport: viewport as any,
      testRunId: parsed.data.testRunId || null,
      manualTestSessionId: parsed.data.manualTestSessionId || null,
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
