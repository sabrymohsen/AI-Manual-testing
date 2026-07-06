import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { createProjectSchema } from "@/schemas"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  
  // Filters
  const search = searchParams.get("search") || ""
  const environment = searchParams.get("environment")
  const testType = searchParams.get("testType")
  const browserType = searchParams.get("browserType")
  const healthStatus = searchParams.get("healthStatus")
  const hasFailedTests = searchParams.get("hasFailedTests") === "true"
  const hasOpenBugs = searchParams.get("hasOpenBugs") === "true"
  const hasUncoveredRequirements = searchParams.get("hasUncoveredRequirements") === "true"
  const setupStatus = searchParams.get("setupStatus") // "complete" | "incomplete"
  const activeOnly = searchParams.get("active") === "true"
  const statusFilter = activeOnly ? "Active" : (searchParams.get("status") || "Active") // "Active" | "Archived" | "All"
  
  // Sorting
  const sortBy = searchParams.get("sortBy") || "RecentlyUpdated" // RecentlyUpdated, ProjectName, LowestPassRate, HighestFailedTests, MostOpenBugs, LowestCoverage, Newest, Oldest
  const sortDirection = searchParams.get("sortDirection") || "desc"

  // Pagination
  const page = parseInt(searchParams.get("page") || "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") || "100", 10)

  // Fetch all projects for the user including necessary child counts and details
  const projects = await prisma.project.findMany({
    where: {
      userId: auth.session!.user.id,
      ...(statusFilter === "All" ? {} : { status: statusFilter as any }),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { webAppUrl: { contains: search, mode: "insensitive" } }
        ]
      } : {}),
      ...(environment && environment !== "All" ? { environment: environment as any } : {}),
      ...(testType && testType !== "All" ? { testType: testType as any } : {}),
      ...(browserType && browserType !== "All" ? { browserType: browserType as any } : {}),
    },
    include: {
      credentials: { select: { id: true } },
      epics: { select: { id: true } },
      requirements: {
        select: {
          id: true,
          testCases: { select: { id: true } }
        }
      },
      testCases: {
        select: {
          id: true,
          testRuns: { select: { id: true } }
        }
      },
      testRuns: {
        select: {
          id: true,
          status: true,
          createdAt: true
        }
      },
      bugReports: {
        select: {
          id: true,
          status: true,
          severity: true,
          createdAt: true
        }
      }
    }
  })

  // Process project details in memory to compute health metrics & setup progress
  const processedProjects = await Promise.all(projects.map(async (project) => {
    const totalCases = project.testCases.length
    const totalRuns = project.testRuns.length
    
    const passedRuns = project.testRuns.filter(r => r.status === "Passed").length
    const failedRuns = project.testRuns.filter(r => r.status === "Failed").length
    const blockedRuns = project.testRuns.filter(r => r.status === "Blocked").length
    
    const openBugs = project.bugReports.filter(b => 
      ["Open", "InProgress", "ReadyForRetest", "Reopened"].includes(b.status)
    )
    const openBugsCount = openBugs.length
    const criticalBugsCount = openBugs.filter(b => b.severity === "Critical").length

    const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0

    // Requirements coverage
    const totalReqs = project.requirements.length
    const uncoveredReqs = project.requirements.filter(r => r.testCases.length === 0).length
    const requirementsCoverage = totalReqs > 0 
      ? Math.round(((totalReqs - uncoveredReqs) / totalReqs) * 100)
      : 100

    // Test cases never executed
    const neverRunCasesCount = project.testCases.filter(c => c.testRuns.length === 0).length

    // Compute Health Score
    let score = 100
    let derivedHealthStatus = "Not Started"

    if (totalCases === 0 || totalRuns === 0) {
      derivedHealthStatus = "Not Started"
      score = 100
    } else {
      const failedPenalty = Math.min(25, failedRuns * 1.5)
      const criticalBugPenalty = Math.min(25, criticalBugsCount * 5)
      const uncoveredReqPenalty = Math.min(20, uncoveredReqs * 3)
      const neverRunPenalty = Math.min(15, neverRunCasesCount * 2)
      
      score = Math.max(0, Math.round(100 - failedPenalty - criticalBugPenalty - uncoveredReqPenalty - neverRunPenalty))

      if (score >= 90 && openBugsCount === 0) {
        derivedHealthStatus = "Excellent"
      } else if (score >= 75) {
        derivedHealthStatus = "Good"
      } else if (score >= 50 || failedRuns > 0) {
        derivedHealthStatus = "Needs Attention"
      } else {
        derivedHealthStatus = "High Risk"
      }
    }

    // Setup completeness: 6 steps
    let setupCompleted = 0
    if (project.webAppUrl && project.webAppUrl.length > 5) setupCompleted++
    if (project.credentials.length > 0) setupCompleted++
    if (project.epics.length > 0) setupCompleted++
    if (totalCases > 0) setupCompleted++
    if (totalReqs > 0) setupCompleted++
    if (totalRuns > 0) setupCompleted++

    const setupTotal = 6

    // Last activity dates
    const runDates = project.testRuns.map(r => new Date(r.createdAt).getTime())
    const bugDates = project.bugReports.map(b => new Date(b.createdAt).getTime())
    
    const lastTestRunAt = runDates.length > 0 ? new Date(Math.max(...runDates)) : null
    const lastBugAt = bugDates.length > 0 ? new Date(Math.max(...bugDates)) : null
    const lastUpdatedAt = project.updatedAt

    return {
      id: project.id,
      name: project.name,
      webAppUrl: project.webAppUrl,
      environment: project.environment,
      testType: project.testType,
      browserType: project.browserType,
      status: project.status,
      metrics: {
        testCases: totalCases,
        testRuns: totalRuns,
        passRate,
        failedTests: failedRuns,
        openBugs: openBugsCount,
        requirementsCoverage,
        healthScore: score,
        healthStatus: derivedHealthStatus,
        setupCompleted,
        setupTotal
      },
      lastActivity: {
        lastTestRunAt,
        lastBugAt,
        lastUpdatedAt
      },
      uncoveredRequirementsCount: uncoveredReqs
    }
  }))

  // Apply frontend in-memory filters
  const filteredProjects = processedProjects.filter(p => {
    // Health status filter
    if (healthStatus && healthStatus !== "All" && p.metrics.healthStatus !== healthStatus) {
      return false
    }
    // Failed tests filter
    if (hasFailedTests && p.metrics.failedTests === 0) {
      return false
    }
    // Open bugs filter
    if (hasOpenBugs && p.metrics.openBugs === 0) {
      return false
    }
    // Uncovered requirements filter
    if (hasUncoveredRequirements && p.uncoveredRequirementsCount === 0) {
      return false
    }
    // Setup completeness filter
    if (setupStatus === "complete" && p.metrics.setupCompleted < p.metrics.setupTotal) {
      return false
    }
    if (setupStatus === "incomplete" && p.metrics.setupCompleted === p.metrics.setupTotal) {
      return false
    }
    return true
  })

  // Apply sorting
  filteredProjects.sort((a, b) => {
    let fieldA: any = a.lastActivity.lastUpdatedAt
    let fieldB: any = b.lastActivity.lastUpdatedAt

    if (sortBy === "ProjectName") {
      fieldA = a.name.toLowerCase()
      fieldB = b.name.toLowerCase()
    } else if (sortBy === "LowestPassRate") {
      fieldA = a.metrics.passRate
      fieldB = b.metrics.passRate
    } else if (sortBy === "HighestFailedTests") {
      fieldA = a.metrics.failedTests
      fieldB = b.metrics.failedTests
    } else if (sortBy === "MostOpenBugs") {
      fieldA = a.metrics.openBugs
      fieldB = b.metrics.openBugs
    } else if (sortBy === "LowestCoverage") {
      fieldA = a.metrics.requirementsCoverage
      fieldB = b.metrics.requirementsCoverage
    } else if (sortBy === "Newest") {
      fieldA = new Date(a.lastActivity.lastUpdatedAt).getTime()
      fieldB = new Date(b.lastActivity.lastUpdatedAt).getTime()
    } else if (sortBy === "Oldest") {
      fieldA = new Date(a.lastActivity.lastUpdatedAt).getTime()
      fieldB = new Date(b.lastActivity.lastUpdatedAt).getTime()
    }

    if (fieldA < fieldB) return sortDirection === "asc" ? -1 : 1
    if (fieldA > fieldB) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  // Summary statistics
  const totalProjects = processedProjects.length
  const activeProjects = processedProjects.filter(p => p.status === "Active").length
  const projectsWithFailures = processedProjects.filter(p => p.metrics.failedTests > 0).length
  const projectsWithOpenBugs = processedProjects.filter(p => p.metrics.openBugs > 0).length
  
  const activePassRates = processedProjects.filter(p => p.metrics.testRuns > 0).map(p => p.metrics.passRate)
  const averagePassRate = activePassRates.length > 0
    ? Math.round(activePassRates.reduce((sum, val) => sum + val, 0) / activePassRates.length)
    : 100

  const activeCoverages = processedProjects.map(p => p.metrics.requirementsCoverage)
  const averageCoverage = activeCoverages.length > 0
    ? Math.round(activeCoverages.reduce((sum, val) => sum + val, 0) / activeCoverages.length)
    : 100

  // Apply Pagination slice
  const startIndex = (page - 1) * pageSize
  const paginatedItems = filteredProjects.slice(startIndex, startIndex + pageSize)

  return NextResponse.json({
    items: paginatedItems,
    projects: paginatedItems,
    summary: {
      totalProjects,
      activeProjects,
      projectsWithFailures,
      projectsWithOpenBugs,
      averagePassRate,
      averageCoverage
    },
    totalCount: filteredProjects.length
  })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = createProjectSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e: any) => e.message).join(", ") },
      { status: 400 }
    )
  }

  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      status: "Active",
      userId: auth.session!.user.id,
    },
  })

  return NextResponse.json({ project }, { status: 201 })
}
