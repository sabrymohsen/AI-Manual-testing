import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }
  const session = auth.session!

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") || undefined

  if (projectId) {
    const projAuth = await requireProjectOwner(projectId)
    if (projAuth.error) {
      return notFoundResponse("Project not found or access denied")
    }
  }
  const moduleId = searchParams.get("moduleId") || undefined
  const featureId = searchParams.get("featureId") || undefined
  const componentId = searchParams.get("componentId") || undefined
  const priority = searchParams.get("priority") || undefined
  const source = searchParams.get("source") || undefined
  const lastRunStatus = searchParams.get("lastRunStatus") || undefined
  const requirementLinked = searchParams.get("requirementLinked") || undefined
  const hasBug = searchParams.get("hasBug") || undefined
  const incomplete = searchParams.get("incomplete") || undefined
  const search = searchParams.get("search") || ""
  const page = searchParams.get("page") || "1"
  const pageSize = searchParams.get("pageSize") || "25"
  const sortBy = searchParams.get("sortBy") || "createdAt"
  const sortDirection = searchParams.get("sortDirection") || "desc"

  // Base where query
  let where: any = {
    project: {
      userId: session.user.id
    }
  }

  if (projectId) {
    where.projectId = projectId
  }

  if (moduleId) {
    where.moduleId = moduleId === "null" ? null : moduleId
  }

  if (featureId) {
    where.featureId = featureId === "null" ? null : featureId
  }

  if (componentId) {
    where.componentId = componentId === "null" ? null : componentId
  }

  if (priority) {
    where.priority = priority as any
  }

  if (source) {
    where.source = source as any
  }

  // Handle incomplete
  if (incomplete === "true") {
    where.OR = [
      { steps: { none: {} } },
      { componentId: null },
      { requirements: { none: {} } },
      { steps: { some: { expectedResult: "" } } }
    ]
  }

  // Handle requirementLinked
  if (requirementLinked === "linked") {
    where.requirements = { some: {} }
  } else if (requirementLinked === "unlinked") {
    where.requirements = { none: {} }
  }

  // Handle hasBug
  if (hasBug === "has_bug") {
    where.OR = [
      ...(where.OR || []),
      { testRuns: { some: { bugReports: { some: {} } } } },
      { manualSessionCases: { some: { stepResults: { some: { bugReportId: { not: null } } } } } }
    ]
  } else if (hasBug === "no_bug") {
    where.testRuns = { none: { bugReports: { some: {} } } }
    where.manualSessionCases = { none: { stepResults: { some: { bugReportId: { not: null } } } } }
  }

  // Handle Search
  if (search) {
    where.OR = [
      ...(where.OR || []),
      { title: { contains: search, mode: "insensitive" } },
      { module: { contains: search, mode: "insensitive" } },
      { moduleRelation: { name: { contains: search, mode: "insensitive" } } },
      { feature: { name: { contains: search, mode: "insensitive" } } },
      { component: { name: { contains: search, mode: "insensitive" } } },
      { steps: { some: { actionDescription: { contains: search, mode: "insensitive" } } } },
      { steps: { some: { expectedResult: { contains: search, mode: "insensitive" } } } },
      { requirements: { some: { requirement: { requirementKey: { contains: search, mode: "insensitive" } } } } }
    ]
  }

  try {
    // 1. Fetch test cases with full relations
    const testCases = await prisma.testCase.findMany({
      where,
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        requirements: {
          include: { requirement: true }
        },
        moduleRelation: true,
        feature: true,
        component: true,
        project: true,
        testRuns: {
          orderBy: { createdAt: "desc" },
          take: 2
        },
        manualSessionCases: {
          orderBy: { completedAt: "desc" },
          take: 1,
          where: { completedAt: { not: null } }
        }
      },
      orderBy: sortBy === "lastRunDate" ? undefined : { [sortBy]: sortDirection }
    })

    // Compute computed status and values in JS
    const computedTestCases = testCases.map((tc) => {
      const activeRun = tc.testRuns.find(r => r.completedAt === null) || null
      const latestCompletedRun = tc.testRuns.find(r => r.completedAt !== null) || null
      const latestManual = tc.manualSessionCases[0] || null

      let status = "NotExecuted"
      let date = null

      let runTime = latestCompletedRun?.completedAt ? new Date(latestCompletedRun.completedAt).getTime() : 0
      let manualTime = latestManual?.completedAt ? new Date(latestManual.completedAt).getTime() : 0

      if (runTime > 0 || manualTime > 0) {
        if (runTime >= manualTime) {
          status = latestCompletedRun?.status ?? "NotExecuted"
          date = latestCompletedRun?.completedAt ?? null
        } else {
          status = latestManual?.status ?? "NotExecuted"
          date = latestManual?.completedAt ?? null
        }
      }

      // Collect warnings
      const warnings = []
      if (!tc.steps || tc.steps.length === 0) warnings.push("No Steps")
      if (tc.steps && tc.steps.some(s => !s.expectedResult)) warnings.push("No Expected Result")
      if (!tc.requirements || tc.requirements.length === 0) warnings.push("No Requirement")
      if (!tc.componentId) warnings.push("No Component")
      if (status === "NotExecuted") warnings.push("Never Run")

      return {
        id: tc.id,
        title: tc.title,
        module: tc.module,
        priority: tc.priority,
        preconditions: tc.preconditions,
        source: tc.source,
        projectId: tc.projectId,
        project: {
          id: tc.project.id,
          name: tc.project.name,
          browserType: tc.project.browserType,
          viewport: tc.project.viewport,
          environment: tc.project.environment
        },
        moduleRelation: tc.moduleRelation,
        feature: tc.feature,
        component: tc.component,
        requirements: tc.requirements.map(r => r.requirement),
        warnings,
        lastRunStatus: status,
        lastRunDate: date,
        stepsCount: tc.steps?.length || 0,
        createdAt: tc.createdAt,
        updatedAt: tc.updatedAt,
        activeRun: activeRun ? {
          testRunId: activeRun.id,
          projectId: activeRun.projectId,
          status: activeRun.status,
          currentStep: null,
          totalSteps: tc.steps?.length || 0
        } : null
      }
    })

    // Filter by lastRunStatus in-memory
    let filteredCases = computedTestCases
    if (lastRunStatus) {
      filteredCases = computedTestCases.filter(c => c.lastRunStatus === lastRunStatus)
    }

    // Sort by lastRunDate in-memory if needed
    if (sortBy === "lastRunDate") {
      filteredCases.sort((a, b) => {
        const timeA = a.lastRunDate ? new Date(a.lastRunDate).getTime() : 0
        const timeB = b.lastRunDate ? new Date(b.lastRunDate).getTime() : 0
        return sortDirection === "asc" ? timeA - timeB : timeB - timeA
      })
    }

    // Compute Summary Card Metrics (on the project-scoped dataset before paginating or applying status filters)
    const summaryBase = computedTestCases
    const totalCount = summaryBase.length
    const passedCount = summaryBase.filter(c => c.lastRunStatus === "Passed").length
    const failedCount = summaryBase.filter(c => c.lastRunStatus === "Failed").length
    const notExecutedCount = summaryBase.filter(c => c.lastRunStatus === "NotExecuted").length
    const highPriorityCount = summaryBase.filter(c => c.priority === "High" || c.priority === "Critical").length
    const unassignedCount = summaryBase.filter(c => !c.component).length

    // Paginate
    const pageNum = parseInt(page, 10)
    const pageSizeNum = parseInt(pageSize, 10)
    const paginatedItems = filteredCases.slice((pageNum - 1) * pageSizeNum, pageNum * pageSizeNum)

    return NextResponse.json({
      items: paginatedItems,
      total: filteredCases.length,
      summary: {
        total: totalCount,
        passed: passedCount,
        failed: failedCount,
        notExecuted: notExecutedCount,
        highPriority: highPriorityCount,
        unassigned: unassignedCount
      }
    })
  } catch (error: any) {
    console.error("GET /api/test-cases error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch test cases" }, { status: 500 })
  }
}
