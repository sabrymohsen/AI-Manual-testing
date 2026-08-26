import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createBugReportSchema } from "@/schemas"
import { requireAuth, requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { withBugModule } from "@/lib/bug-reports/module"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") || undefined
  const featureId = searchParams.get("featureId") || undefined
  const componentId = searchParams.get("componentId") || undefined
  const severity = searchParams.get("severity") || undefined
  const priority = searchParams.get("priority") || undefined
  const status = searchParams.get("status") || undefined
  const environment = searchParams.get("environment") || undefined
  const assignedTo = searchParams.get("assignedTo") || undefined
  const requirementId = searchParams.get("requirementId") || undefined
  const testCaseId = searchParams.get("testCaseId") || undefined
  const hasScreenshot = searchParams.get("hasScreenshot") || undefined
  const hasLogs = searchParams.get("hasLogs") || undefined
  const dateFrom = searchParams.get("dateFrom") || undefined
  const dateTo = searchParams.get("dateTo") || undefined
  const search = searchParams.get("search") || ""
  const page = searchParams.get("page") || "1"
  const pageSize = searchParams.get("pageSize") || "25"
  const sortBy = searchParams.get("sortBy") || "createdAt"
  const sortDirection = searchParams.get("sortDirection") || "desc"

  if (projectId) {
    const ownerAuth = await requireProjectOwner(projectId)
    if (ownerAuth.error) return unauthorizedResponse(ownerAuth.error)
  }

  try {
    // 1. Get user's projects to ensure strict isolation
    const userProjects = await prisma.project.findMany({
      where: { userId: auth.session!.user.id },
      select: { id: true }
    })
    const projectIds = userProjects.map(p => p.id)

    // Build the query constraints
    let where: any = {
      OR: [
        { projectId: { in: projectIds } },
        { testRun: { projectId: { in: projectIds } } },
        { manualTestSession: { projectId: { in: projectIds } } }
      ]
    }

    if (projectId) {
      where = {
        AND: [
          {
            OR: [
              { projectId: projectId },
              { testRun: { projectId: projectId } },
              { manualTestSession: { projectId: projectId } }
            ]
          },
          {
            OR: [
              { projectId: { in: projectIds } },
              { testRun: { projectId: { in: projectIds } } },
              { manualTestSession: { projectId: { in: projectIds } } }
            ]
          }
        ]
      }
    }

    // Specific filters
    if (featureId) {
      where.featureId = featureId === "null" ? null : featureId
    }
    if (componentId) {
      where.componentId = componentId === "null" ? null : componentId
    }
    if (severity) {
      where.severity = severity as any
    }
    if (priority) {
      where.priority = priority as any
    }

    // Status filter
    if (status && status !== "all") {
      where.status = status as any
    } else if (!status) {
      // Default: show Open, InProgress, Reopened
      where.status = { in: ["Open", "InProgress", "Reopened"] }
    }

    if (environment) {
      where.environment = environment as any
    }
    if (assignedTo) {
      where.assignedTo = assignedTo === "unassigned" ? null : assignedTo
    }
    if (requirementId) {
      where.requirements = { some: { requirementId } }
    }
    if (testCaseId) {
      where.testCaseId = testCaseId
    }

    // Screenshots / Logs existence
    if (hasScreenshot === "true") {
      where.screenshotPath = { not: null }
    } else if (hasScreenshot === "false") {
      where.screenshotPath = null
    }

    if (hasLogs === "true") {
      where.consoleLogs = { not: null }
    } else if (hasLogs === "false") {
      where.consoleLogs = null
    }

    // Date range
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo) where.createdAt.lte = new Date(dateTo)
    }

    // Search filters
    if (search) {
      where.OR = [
        ...(where.OR || []),
        { title: { contains: search, mode: "insensitive" } },
        { bugKey: { contains: search, mode: "insensitive" } },
        { stepsToReproduce: { contains: search, mode: "insensitive" } },
        { actualResult: { contains: search, mode: "insensitive" } },
        { expectedResult: { contains: search, mode: "insensitive" } },
        { project: { name: { contains: search, mode: "insensitive" } } },
        { moduleRelation: { name: { contains: search, mode: "insensitive" } } },
        { feature: { name: { contains: search, mode: "insensitive" } } },
        { component: { name: { contains: search, mode: "insensitive" } } },
        { testCase: { title: { contains: search, mode: "insensitive" } } },
        { requirements: { some: { requirement: { requirementKey: { contains: search, mode: "insensitive" } } } } }
      ]
    }

    // 2. Fetch summary count metrics (project-scoped, status-unfiltered)
    const summaryBugs = await prisma.bugReport.findMany({
      where: {
        OR: [
          { projectId: projectId || { in: projectIds } },
          { testRun: { projectId: projectId || { in: projectIds } } },
          { manualTestSession: { projectId: projectId || { in: projectIds } } }
        ]
      },
      select: {
        id: true,
        status: true,
        severity: true,
        priority: true,
        testRunId: true,
        testStepResultId: true
      }
    })

    const metrics = {
      total: summaryBugs.length,
      open: summaryBugs.filter(b => ["Open", "InProgress", "Reopened"].includes(b.status)).length,
      critical: summaryBugs.filter(b => b.severity === "Critical").length,
      highPriority: summaryBugs.filter(b => b.priority === "High" || b.priority === "Critical").length,
      failedTestBugs: summaryBugs.filter(b => b.testRunId !== null || b.testStepResultId !== null).length,
      resolved: summaryBugs.filter(b => ["Resolved", "Closed"].includes(b.status)).length
    }

    // 3. Paginated bugs query
    const totalCount = await prisma.bugReport.count({ where })
    const pageNum = parseInt(page, 10)
    const sizeNum = parseInt(pageSize, 10)

    const items = await prisma.bugReport.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        testCase: { select: { id: true, title: true } },
        requirements: { include: { requirement: true } },
        testRun: { select: { id: true, browserType: true } },
        bugAttachments: true
      },
      orderBy: { [sortBy]: sortDirection as any },
      skip: (pageNum - 1) * sizeNum,
      take: sizeNum
    })

    return NextResponse.json({
      items,
      total: totalCount,
      summary: metrics
    })
  } catch (error: any) {
    console.error("GET /api/bug-reports error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch bug reports" }, { status: 500 })
  }
}



export async function POST(request: Request) {
  const authCheck = await requireAuth()
  if (authCheck.error) return unauthorizedResponse(authCheck.error)

  try {
    const body = await request.json()
    const parsed = createBugReportSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const {
      projectId,
      title,
      severity,
      priority,
      status,
      environment,
      assignedTo,
      stepsToReproduce,
      expectedResult,
      actualResult,
      testCaseId,
      requirementIds
    } = parsed.data

    const auth = await requireProjectOwner(projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    // 1. Generate sequential bug key e.g., BUG-0001
    const count = await prisma.bugReport.count({ where: { projectId } })
    const bugKey = `BUG-${String(count + 1).padStart(4, "0")}`

    // 2. Write bug report
    const bugReport = await prisma.$transaction(async (tx) => {
      const bug = await tx.bugReport.create({
        data: await withBugModule({
          bugKey,
          title,
          projectId,
          testCaseId: testCaseId || null,
          severity: severity || "Medium",
          priority: priority || "Medium",
          status: status || "Open",
          environment: environment || "Staging",
          assignedTo: assignedTo || null,
          stepsToReproduce: stepsToReproduce || "",
          expectedResult: expectedResult || "",
          actualResult: actualResult || "",
          roleUsed: "None",
          browser: "Chromium",
          viewport: "Desktop",
          requirements: requirementIds && Array.isArray(requirementIds)
            ? {
                create: requirementIds.map((reqId: string) => ({
                  requirementId: reqId
                }))
              }
            : undefined
        })
      })

      // Add audit log activity
      await tx.bugActivity.create({
        data: {
          bugId: bug.id,
          action: "Bug Created",
          details: `Manual bug report created with ID ${bugKey}. Status set to ${bug.status}.`
        }
      })

      return bug
    })

    return NextResponse.json({ bugReport }, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/bug-reports error:", error)
    return NextResponse.json({ error: error.message || "Failed to create bug report" }, { status: 500 })
  }
}
