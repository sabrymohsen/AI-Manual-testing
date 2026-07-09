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
  const status = searchParams.get("status")
  const source = searchParams.get("source")
  const search = searchParams.get("search") || ""

  // Build prisma query constraints matching user project scope
  const where: any = {
    AND: [
      {
        OR: [
          { projectId: params.projectId },
          { testRun: { projectId: params.projectId } },
          { manualTestSession: { projectId: params.projectId } }
        ]
      }
    ]
  }

  if (severity && severity !== "all") {
    where.AND.push({ severity: severity as any })
  }
  if (priority && priority !== "all") {
    where.AND.push({ priority: priority as any })
  }
  if (status && status !== "all") {
    where.AND.push({ status: status as any })
  }
  if (source && source !== "all") {
    if (source === "Auto") {
      where.AND.push({
        OR: [
          { testRunId: { not: null } },
          { testStepResultId: { not: null } }
        ]
      })
    } else {
      // Find matches on manual sessions or manual creation
      where.AND.push({
        testRunId: null,
        testStepResultId: null
      })
    }
  }

  if (search) {
    where.AND.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { bugKey: { contains: search, mode: "insensitive" } },
        { stepsToReproduce: { contains: search, mode: "insensitive" } },
        { actualResult: { contains: search, mode: "insensitive" } },
        { expectedResult: { contains: search, mode: "insensitive" } }
      ]
    })
  }

  const bugReports = await prisma.bugReport.findMany({
    where,
    include: {
      testCase: {
        select: { id: true, title: true }
      },
      testRun: {
        select: { id: true, status: true, browserType: true, createdAt: true }
      },
      manualTestSession: {
        select: { id: true, name: true, browserType: true }
      },
      comments: {
        orderBy: { createdAt: "desc" }
      },
      activities: {
        orderBy: { createdAt: "desc" }
      },
      occurrences: {
        orderBy: { occurredAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" }
  })

  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: {
      projectId: params.projectId,
      localEntityType: "BugReport"
    }
  })

  const bugReportsWithSync = bugReports.map(bug => {
    const mapping = syncMappings.find(m => m.localEntityId === bug.id)
    return {
      ...bug,
      openProjectSyncStatus: mapping ? (mapping.lastSyncStatus === "success" ? "Synced" : "Failed") : "Not Synced",
      openProjectWorkPackageId: mapping?.externalId || null,
      openProjectWorkPackageUrl: mapping?.externalUrl || null
    }
  })

  return NextResponse.json({ bugReports: bugReportsWithSync })
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
    videoUrl: z.string().optional().nullable(),
    openProjectParentId: z.string().optional().nullable(),
    pageUrl: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    recordingSessionId: z.string().optional().nullable(),
  })
  const parsed = bugReportBodySchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }

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

  // Link the bug to the Live QA session it was filed from (ownership-checked so
  // an arbitrary session id can't be attached). Powers Live QA History bug counts.
  let recordingSessionId: string | null = null
  if (parsed.data.recordingSessionId) {
    const sess = await prisma.recordingSession.findFirst({
      where: { id: parsed.data.recordingSessionId, projectId: params.projectId },
      select: { id: true },
    })
    if (sess) recordingSessionId = sess.id
  }

  let requirementIds: string[] = []
  if (testCaseId) {
    const tcRequirements = await prisma.testCaseRequirement.findMany({
      where: { testCaseId }
    })
    requirementIds = tcRequirements.map((r) => r.requirementId)
  }

  // Generate sequential bug key e.g., BUG-0001
  const count = await prisma.bugReport.count({ where: { projectId: params.projectId } })
  const bugKey = `BUG-${String(count + 1).padStart(4, "0")}`

  const bugReport = await prisma.$transaction(async (tx) => {
    const bug = await tx.bugReport.create({
      data: {
        bugKey,
        title: parsed.data.title,
        projectId: params.projectId,
        severity: parsed.data.severity || "Medium",
        priority: parsed.data.priority || "Medium",
        status: parsed.data.status || "Open",
        resolution: parsed.data.resolution || null,
        resolutionNote: parsed.data.resolutionNote || null,
        tags: parsed.data.tags || [],
        reporterId: auth.session!.user.id,
        environment: env as any,
        roleUsed,
        stepsToReproduce: parsed.data.stepsToReproduce || "",
        expectedResult: parsed.data.expectedResult || "",
        actualResult: parsed.data.actualResult || "",
        screenshotPath: parsed.data.screenshotPath || null,
        consoleLogs: parsed.data.consoleLogs || null,
        networkErrors: parsed.data.networkErrors || null,
        videoUrl: parsed.data.videoUrl || null,
        pageUrl: parsed.data.pageUrl || null,
        assignedTo: parsed.data.assignedTo || null,
        openProjectParentId: parsed.data.openProjectParentId || null,
        source: parsed.data.source || null,
        recordingSessionId,
        browser: browser as any,
        viewport: viewport as any,
        testRunId: parsed.data.testRunId || null,
        manualTestSessionId: parsed.data.manualTestSessionId || null,
        testCaseId: testCaseId || null,
        requirements: requirementIds.length > 0
          ? {
              create: requirementIds.map((reqId) => ({
                requirementId: reqId
              }))
            }
          : undefined
      },
    })

    await tx.bugActivity.create({
      data: {
        bugId: bug.id,
        action: "Bug Created",
        details: `Bug report created manually. Key assigned: ${bugKey}.`
      }
    })

    return bug
  })

  return NextResponse.json({ bugReport }, { status: 201 })
}
