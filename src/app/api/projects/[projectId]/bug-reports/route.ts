import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, requireProjectMember, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createBugReportSchema } from "@/schemas"
import { recalcOpenBugCount } from "@/lib/test-cases/rollup"
import { resolveBugSuiteId } from "@/lib/bug-reports/module"
import { z } from "zod"

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // Listing bugs is member-level. requireProjectOwner demanded Owner/Admin, so
  // ordinary members — the testers who file most bugs — got a 404 here. POST
  // below remains owner-gated.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  const severity = searchParams.get("severity")
  const priority = searchParams.get("priority")
  const status = searchParams.get("status")
  const source = searchParams.get("source")
  const search = searchParams.get("search") || ""

  // Pagination is opt-in: pass `limit` to page, omit it to get the full list.
  // Defaulting to a page size would silently hide bugs from the current UI,
  // which has no "load more" yet — so the default stays unbounded and the
  // ceiling is available to callers that can consume it.
  const limitParam = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null
  const cursor = searchParams.get("cursor") || null

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
    if (status.includes(",")) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean)
      where.AND.push({ status: { in: statuses as any } })
    } else {
      where.AND.push({ status: status as any })
    }
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

  // Module/service filter. "unfiled" is a first-class answer, not the absence
  // of a filter: a project's unfiled defects are exactly what a QA lead chases
  // before publishing a report.
  const suite = searchParams.get("suite")
  if (suite === "unfiled") {
    where.AND.push({ suiteId: null })
  } else if (suite && suite !== "all") {
    where.AND.push({ suiteId: suite })
  }

  // Triage filters. "Who has nothing assigned?" and "what's been reopened?" are
  // the two questions a triage session actually starts with, and neither was
  // expressible before.
  const assignee = searchParams.get("assignee")
  if (assignee === "unassigned") {
    where.AND.push({ OR: [{ assignedTo: null }, { assignedTo: "" }] })
  } else if (assignee && assignee !== "all") {
    where.AND.push({ assignedTo: assignee })
  }

  if (searchParams.get("reopened") === "true") {
    where.AND.push({ reopenCount: { gt: 0 } })
  }

  // Bugs older than N days that aren't settled — the neglected pile.
  const staleDays = Number(searchParams.get("staleDays"))
  if (Number.isFinite(staleDays) && staleDays > 0) {
    where.AND.push({
      createdAt: { lt: new Date(Date.now() - staleDays * 86_400_000) },
      status: { notIn: ["Closed", "Rejected", "Duplicate"] as any },
    })
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

  const rows = await prisma.bugReport.findMany({
    where,
    include: {
      testCase: {
        select: { id: true, title: true }
      },
      suite: {
        select: { id: true, name: true }
      },
      testRun: {
        select: { id: true, status: true, browserType: true, createdAt: true }
      },
      manualTestSession: {
        select: { id: true, name: true, browserType: true }
      },
      // Counts, not the rows themselves. This previously pulled EVERY comment,
      // activity and occurrence for EVERY bug — on a project with 500 bugs and
      // 20 comments each that's 10k rows shipped to render a list that displays
      // none of them. The detail drawer refetches the full bug from
      // /api/bug-reports/[bugId], so nothing needed them here.
      _count: {
        select: { comments: true, activities: true, occurrences: true }
      }
    },
    orderBy: { createdAt: "desc" },
    // `id` is a stable tiebreak so cursor paging can't repeat or drop rows when
    // several bugs share a createdAt.
    ...(limit ? { take: limit + 1 } : {}),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = limit !== null && rows.length > limit
  const bugReports = hasMore ? rows.slice(0, limit!) : rows

  // Scope the sync lookup to the rows actually being returned.
  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: {
      projectId: params.projectId,
      localEntityType: "BugReport",
      ...(bugReports.length ? { localEntityId: { in: bugReports.map(b => b.id) } } : {})
    }
  })
  const syncById = new Map(syncMappings.map(m => [m.localEntityId, m]))

  const bugReportsWithSync = bugReports.map(({ _count, ...bug }) => {
    const mapping = syncById.get(bug.id)
    return {
      ...bug,
      commentCount: _count.comments,
      activityCount: _count.activities,
      // Whole days since the bug was filed. Derived here so every consumer
      // agrees on the number rather than each recomputing it from createdAt.
      ageDays: Math.floor((Date.now() - new Date(bug.createdAt).getTime()) / 86_400_000),
      // How many times this defect has recurred across test runs. Already
      // recorded by on-test-run-completed.ts; never previously surfaced.
      occurrenceCount: _count.occurrences,
      openProjectSyncStatus: mapping ? (mapping.lastSyncStatus === "success" ? "Synced" : "Failed") : "Not Synced",
      openProjectWorkPackageId: mapping?.externalId || null,
      openProjectWorkPackageUrl: mapping?.externalUrl || null
    }
  })

  return NextResponse.json({
    bugReports: bugReportsWithSync,
    nextCursor: hasMore ? bugReports[bugReports.length - 1].id : null
  })
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

  // Module/service the defect belongs to: what the caller picked, or the linked
  // case's suite when they picked nothing.
  const suiteId = await resolveBugSuiteId(params.projectId, {
    suiteId: parsed.data.suiteId,
    testCaseId
  })

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
        suiteId,
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

  // A new bug against a case changes its open-bug count, which the test-case
  // list reads straight off TestCase.openBugCount.
  if (testCaseId) await recalcOpenBugCount(testCaseId)

  return NextResponse.json({ bugReport }, { status: 201 })
}
