import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") || undefined
  if (projectId && projectId !== "All") {
    const ownerAuth = await requireProjectOwner(projectId)
    if (ownerAuth.error) return unauthorizedResponse(ownerAuth.error)
  }
  const environment = searchParams.get("environment") || undefined
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")

  // Date filters
  const dateFilter: any = {}
  if (dateFrom || dateTo) {
    dateFilter.createdAt = {}
    if (dateFrom) dateFilter.createdAt.gte = new Date(dateFrom)
    if (dateTo) dateFilter.createdAt.lte = new Date(dateTo)
  } else {
    // Default to last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    dateFilter.createdAt = { gte: thirtyDaysAgo }
  }

  // Base scoping filters
  const projectScope: any = { userId: session.user.id }
  if (projectId && projectId !== "All") {
    projectScope.id = projectId
  }
  if (environment && environment !== "All") {
    projectScope.environment = environment as any
  }

  // Fetch projects under scope
  const scopedProjects = await prisma.project.findMany({
    where: projectScope,
    select: { id: true, name: true, environment: true }
  })
  const projectIds = scopedProjects.map(p => p.id)

  if (projectIds.length === 0) {
    return NextResponse.json({
      healthScore: 100,
      summary: {
        projects: 0,
        testCases: 0,
        testRuns: 0,
        passRate: 100,
        passed: 0,
        failed: 0,
        warnings: 0,
        openBugs: 0,
        requirementsCoverage: 100
      },
      actionRequired: {
        failedTests: 0,
        criticalBugs: 0,
        uncoveredRequirements: 0,
        neverRunTestCases: 0,
        blockedTests: 0,
        unassignedTestCases: 0
      },
      recentFailedTests: [],
      openBugs: [],
      coverage: {
        total: 0,
        covered: 0,
        partiallyCovered: 0,
        uncovered: 0,
        failed: 0,
        blocked: 0,
        percent: 100
      },
      riskAreas: [],
      trends: {
        dailyRuns: [],
        severityPie: [],
        coverageByModule: []
      },
      recentActivity: [],
      projectHealth: []
    })
  }

  // Define database where conditions
  const testCaseWhere = { projectId: { in: projectIds } }
  const testRunWhere = { projectId: { in: projectIds }, ...dateFilter }
  const bugReportWhere = { projectId: { in: projectIds }, ...dateFilter }
  const requirementWhere = { projectId: { in: projectIds } }

  // 1. Fetch counts
  const totalTestCases = await prisma.testCase.count({ where: testCaseWhere })
  const totalTestRuns = await prisma.testRun.count({ where: testRunWhere })
  const passedRuns = await prisma.testRun.count({ where: { ...testRunWhere, status: "Passed" } })
  const failedRuns = await prisma.testRun.count({ where: { ...testRunWhere, status: "Failed" } })
  const warningRuns = await prisma.testRun.count({ where: { ...testRunWhere, status: "Warning" } })
  const blockedRuns = await prisma.testRun.count({ where: { ...testRunWhere, status: "Blocked" } })

  const openBugsCount = await prisma.bugReport.count({
    where: {
      projectId: { in: projectIds },
      status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] }
    }
  })

  const passRate = totalTestRuns > 0 ? Math.round((passedRuns / totalTestRuns) * 100) : 0

  // 2. Requirements & Coverage
  const requirements = await prisma.requirement.findMany({
    where: requirementWhere,
    include: {
      testCases: {
        include: {
          testCase: {
            include: {
              testRuns: {
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          }
        }
      }
    }
  })

  let coveredCount = 0
  let partiallyCoveredCount = 0
  let uncoveredCount = 0
  let failedReqCount = 0
  let blockedReqCount = 0

  requirements.forEach(req => {
    const linkedCases = req.testCases.map(tc => tc.testCase)
    if (linkedCases.length === 0) {
      uncoveredCount++
    } else {
      let hasPass = false
      let hasFail = false
      let hasBlock = false
      linkedCases.forEach(c => {
        const lastRun = c.testRuns[0]
        if (lastRun) {
          if (lastRun.status === "Passed") hasPass = true
          if (lastRun.status === "Failed") hasFail = true
          if (lastRun.status === "Blocked") hasBlock = true
        }
      })

      if (hasFail) failedReqCount++
      else if (hasBlock) blockedReqCount++

      if (hasPass && linkedCases.length > 1) {
        coveredCount++
      } else if (linkedCases.length > 0) {
        partiallyCoveredCount++
      }
    }
  })

  const totalRequirements = requirements.length
  const requirementsCoverage = totalRequirements > 0
    ? Math.round(((totalRequirements - uncoveredCount) / totalRequirements) * 100)
    : 100

  // 3. Action Required items
  const neverRunCases = await prisma.testCase.findMany({
    where: {
      projectId: { in: projectIds },
      testRuns: { none: {} }
    },
    select: { id: true, title: true }
  })

  // "Unassigned" now means: no linked user story
  const unassignedCases = await prisma.testCase.findMany({
    where: {
      projectId: { in: projectIds },
      requirements: { none: {} }
    },
    select: { id: true, title: true }
  })

  const criticalBugsCount = await prisma.bugReport.count({
    where: {
      projectId: { in: projectIds },
      status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] },
      severity: "Critical"
    }
  })

  const actionRequired = {
    failedTests: failedRuns,
    criticalBugs: criticalBugsCount,
    uncoveredRequirements: uncoveredCount,
    neverRunTestCases: neverRunCases.length,
    blockedTests: blockedRuns,
    unassignedTestCases: unassignedCases.length
  }

  // 4. Calculate Health Score
  const failedPenalty = Math.min(25, failedRuns * 1.5)
  const criticalBugPenalty = Math.min(25, criticalBugsCount * 5)
  const uncoveredReqPenalty = Math.min(20, uncoveredCount * 3)
  const blockedRunPenalty = Math.min(15, blockedRuns * 2)
  const neverRunPenalty = Math.min(15, neverRunCases.length * 2)
  const healthScore = Math.max(0, Math.round(100 - failedPenalty - criticalBugPenalty - uncoveredReqPenalty - blockedRunPenalty - neverRunPenalty))

  // 5. Recent Failed Tests
  const recentFailedRuns = await prisma.testRun.findMany({
    where: { ...testRunWhere, status: "Failed" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      testCase: {
        select: {
          id: true,
          title: true
        }
      },
      project: { select: { name: true } },
      bugReports: { select: { id: true, bugKey: true } },
      logs: { orderBy: { timestamp: "desc" }, take: 1 }
    }
  })

  const formattedFailedTests = recentFailedRuns.map(run => ({
    id: run.id,
    testCaseId: run.testCase?.id || null,
    testCaseTitle: run.testCase?.title || "Unknown Case",
    project: run.project.name,
    failedAt: run.completedAt || run.createdAt,
    failureReason: run.logs[0]?.message || "Assertion failed or step timeout.",
    bugId: run.bugReports[0]?.id || null,
    bugKey: run.bugReports[0]?.bugKey || null
  }))

  // 6. Top Open Bugs
  const openBugs = await prisma.bugReport.findMany({
    where: {
      projectId: { in: projectIds },
      status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] }
    },
    orderBy: [
      { severity: "desc" },
      { createdAt: "desc" }
    ],
    take: 5,
    include: {
      project: { select: { name: true } },
      testCase: { select: { title: true } }
    }
  })

  const formattedOpenBugs = openBugs.map(bug => ({
    id: bug.id,
    bugKey: bug.bugKey,
    title: bug.title,
    project: bug.project?.name || "Unknown",
    severity: bug.severity,
    priority: bug.priority,
    status: bug.status,
    linkedTestCase: bug.testCase?.title || null,
    createdAt: bug.createdAt
  }))

  // 7. Open Bugs Severity distribution for Donut Chart
  const bugSeverities = ["Critical", "High", "Medium", "Low"]
  const severityPie = await Promise.all(bugSeverities.map(async (sev) => {
    const value = await prisma.bugReport.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] },
        severity: sev as any
      }
    })
    return { name: sev, value }
  }))

  // 8. Trends: test runs by day
  const dailyRuns: any[] = []
  const startDay = new Date()
  startDay.setDate(startDay.getDate() - 6)
  for (let i = 0; i < 7; i++) {
    const current = new Date(startDay)
    current.setDate(current.getDate() + i)
    const dayStart = new Date(current.setHours(0, 0, 0, 0))
    const dayEnd = new Date(current.setHours(23, 59, 59, 999))

    const passed = await prisma.testRun.count({
      where: {
        projectId: { in: projectIds },
        status: "Passed",
        createdAt: { gte: dayStart, lte: dayEnd }
      }
    })
    const failed = await prisma.testRun.count({
      where: {
        projectId: { in: projectIds },
        status: "Failed",
        createdAt: { gte: dayStart, lte: dayEnd }
      }
    })
    const blocked = await prisma.testRun.count({
      where: {
        projectId: { in: projectIds },
        status: "Blocked",
        createdAt: { gte: dayStart, lte: dayEnd }
      }
    })
    const warning = await prisma.testRun.count({
      where: {
        projectId: { in: projectIds },
        status: "Warning",
        createdAt: { gte: dayStart, lte: dayEnd }
      }
    })

    dailyRuns.push({
      date: dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      passed,
      failed,
      blocked,
      warning,
      total: passed + failed + blocked + warning
    })
  }

  // 9. Epic Coverage horizontal bar chart data (test cases reached via story links)
  const epics = await prisma.epic.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      requirements: {
        select: {
          id: true,
          testCases: {
            select: {
              testCase: {
                select: {
                  id: true,
                  testRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } }
                }
              }
            }
          },
          bugReports: { select: { bugReport: { select: { status: true } } } }
        }
      }
    }
  })

  const epicRollups = epics.map(epic => {
    const caseMap = new Map<string, { latestStatus: string | null }>()
    let openBugs = 0
    epic.requirements.forEach(req => {
      req.testCases.forEach(link => {
        if (link.testCase) {
          caseMap.set(link.testCase.id, { latestStatus: link.testCase.testRuns[0]?.status ?? null })
        }
      })
      openBugs += req.bugReports.filter(b =>
        ["Open", "InProgress", "ReadyForRetest", "Reopened"].includes(b.bugReport.status)
      ).length
    })
    const cases = Array.from(caseMap.values())
    const totalCases = cases.length
    const passedCases = cases.filter(c => c.latestStatus === "Passed").length
    const failedRunsCount = cases.filter(c => c.latestStatus === "Failed").length
    const executedCases = cases.filter(c => c.latestStatus !== null).length
    return { epic, totalCases, passedCases, failedRunsCount, executedCases, openBugs }
  })

  const coverageByModule = epicRollups.map(({ epic, totalCases, passedCases }) => ({
    name: `${epic.epicKey} — ${epic.title}`,
    testCases: totalCases,
    passRate: totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0,
    requirements: epic.requirements.length
  })).slice(0, 8)

  // 10. Risk Areas (per epic)
  const riskAreas = epicRollups.map(({ epic, totalCases, failedRunsCount, executedCases, openBugs }) => {
    let risk = "Low"
    if (openBugs >= 3 || failedRunsCount >= 8) risk = "Critical"
    else if (openBugs >= 1 || failedRunsCount >= 3) risk = "High"
    else if (failedRunsCount > 0) risk = "Medium"
    return {
      id: epic.id,
      name: `${epic.epicKey} — ${epic.title}`,
      failedRuns: failedRunsCount,
      openBugs,
      coverage: totalCases > 0 ? Math.round((executedCases / totalCases) * 100) : 0,
      risk
    }
  })

  const sortedRiskAreas = riskAreas
    .filter(a => a.failedRuns > 0 || a.openBugs > 0)
    .sort((a, b) => b.failedRuns + b.openBugs * 2 - (a.failedRuns + a.openBugs * 2))
    .slice(0, 5)

  // 11. Activity Feed
  const auditLogs = await prisma.auditLog.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      project: { select: { name: true } }
    }
  })

  const formattedActivity = auditLogs.map(log => ({
    id: log.id,
    action: log.action,
    details: log.details,
    project: log.project?.name || "Global",
    time: log.createdAt,
    user: "System/User"
  }))

  // 12. Project Health List
  const projectHealthList = await Promise.all(scopedProjects.map(async (proj) => {
    const tcCount = await prisma.testCase.count({ where: { projectId: proj.id } })
    const trCount = await prisma.testRun.count({ where: { projectId: proj.id, ...dateFilter } })
    const passCount = await prisma.testRun.count({ where: { projectId: proj.id, status: "Passed", ...dateFilter } })
    const failCount = await prisma.testRun.count({ where: { projectId: proj.id, status: "Failed", ...dateFilter } })
    const blockCount = await prisma.testRun.count({ where: { projectId: proj.id, status: "Blocked", ...dateFilter } })
    const bugsCount = await prisma.bugReport.count({
      where: {
        projectId: proj.id,
        status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] }
      }
    })
    const critBugsCount = await prisma.bugReport.count({
      where: {
        projectId: proj.id,
        status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] },
        severity: "Critical"
      }
    })

    const pRate = trCount > 0 ? Math.round((passCount / trCount) * 100) : 0

    const reqsCount = await prisma.requirement.count({ where: { projectId: proj.id } })
    const uncoveredReqsCount = await prisma.requirement.count({
      where: {
        projectId: proj.id,
        testCases: { none: {} }
      }
    })
    const covRate = reqsCount > 0 ? Math.round(((reqsCount - uncoveredReqsCount) / reqsCount) * 100) : 100

    const neverRunCount = await prisma.testCase.count({
      where: {
        projectId: proj.id,
        testRuns: { none: {} }
      }
    })

    const fPen = Math.min(25, failCount * 1.5)
    const cPen = Math.min(25, critBugsCount * 5)
    const uPen = Math.min(20, uncoveredReqsCount * 3)
    const bPen = Math.min(15, blockCount * 2)
    const nPen = Math.min(15, neverRunCount * 2)
    const pHealthScore = Math.max(0, Math.round(100 - fPen - cPen - uPen - bPen - nPen))

    return {
      id: proj.id,
      name: proj.name,
      environment: proj.environment,
      testCases: tcCount,
      testRuns: trCount,
      passRate: pRate,
      openBugs: bugsCount,
      coverage: covRate,
      failedTests: failCount,
      healthScore: pHealthScore
    }
  }))

  return NextResponse.json({
    healthScore,
    summary: {
      projects: scopedProjects.length,
      testCases: totalTestCases,
      testRuns: totalTestRuns,
      passRate,
      passed: passedRuns,
      failed: failedRuns,
      warnings: warningRuns,
      openBugs: openBugsCount,
      requirementsCoverage
    },
    actionRequired,
    recentFailedTests: formattedFailedTests,
    openBugs: formattedOpenBugs,
    coverage: {
      total: totalRequirements,
      covered: coveredCount,
      partiallyCovered: partiallyCoveredCount,
      uncovered: uncoveredCount,
      failed: failedReqCount,
      blocked: blockedReqCount,
      percent: requirementsCoverage
    },
    riskAreas: sortedRiskAreas,
    trends: {
      dailyRuns,
      severityPie,
      coverageByModule
    },
    recentActivity: formattedActivity,
    projectHealth: projectHealthList
  })
}
