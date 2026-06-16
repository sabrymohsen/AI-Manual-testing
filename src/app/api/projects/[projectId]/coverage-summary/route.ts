import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const requirements = await prisma.requirement.findMany({
      where: { projectId: params.projectId },
      include: {
        module: { select: { id: true, name: true } },
        feature: { select: { id: true, name: true } },
        component: { select: { id: true, name: true } },
        testCases: {
          include: {
            testCase: {
              include: {
                testRuns: {
                  where: { status: { notIn: ["Queued", "Running"] } },
                  orderBy: { completedAt: "desc" },
                  take: 1
                },
                manualSessionCases: {
                  where: { status: { notIn: ["Pending", "Running"] } },
                  orderBy: { completedAt: "desc" },
                  take: 1
                }
              }
            }
          }
        },
        bugReports: {
          include: {
            bugReport: true
          }
        }
      }
    })

    const total = requirements.length
    let covered = 0
    let partiallyCovered = 0
    let uncovered = 0
    let failed = 0
    let blocked = 0
    let notExecuted = 0
    let withBugs = 0

    const moduleStats: Record<string, { total: number; covered: number }> = {}
    const featureStats: Record<string, { total: number; covered: number }> = {}
    const componentStats: Record<string, { total: number; covered: number }> = {}

    const highPriorityNotCovered: any[] = []
    const failedCritical: any[] = []
    const noTestCases: any[] = []
    const openBugs: any[] = []

    requirements.forEach((req) => {
      const links = req.testCases || []
      const bugs = req.bugReports || []
      
      let coverageStatus = "Uncovered"
      let hasFailed = false
      let hasBlocked = false
      let hasWarning = false
      let hasNotExecuted = false
      let hasPassed = false

      const hasCriticalBugs = bugs.some(
        (b) => b.bugReport.severity === "Critical" || b.bugReport.severity === "High"
      )
      if (hasCriticalBugs) {
        hasBlocked = true
      }

      if (bugs.length > 0) {
        withBugs++
        openBugs.push({ id: req.id, requirementKey: req.requirementKey, title: req.title, bugsCount: bugs.length })
      }

      if (links.length === 0) {
        uncovered++
        noTestCases.push({ id: req.id, requirementKey: req.requirementKey, title: req.title })
        if (req.priority === "High" || req.priority === "Critical") {
          highPriorityNotCovered.push({ id: req.id, requirementKey: req.requirementKey, title: req.title, priority: req.priority })
        }
      } else {
        links.forEach((link) => {
          const tc = link.testCase
          if (!tc) return

          const latestRun = tc.testRuns?.[0] || null
          const latestManualCase = tc.manualSessionCases?.[0] || null

          let latestStatus = "NotExecuted"
          let latestTime = 0

          if (latestRun && latestRun.completedAt) {
            latestTime = new Date(latestRun.completedAt).getTime()
            latestStatus = latestRun.status
          }

          if (latestManualCase && latestManualCase.completedAt) {
            const mTime = new Date(latestManualCase.completedAt).getTime()
            if (mTime > latestTime) {
              latestTime = mTime
              latestStatus = latestManualCase.status
            }
          }

          if (
            latestStatus === "NotExecuted" ||
            latestStatus === "Pending" ||
            latestStatus === "Queued" ||
            latestStatus === "Running"
          ) {
            hasNotExecuted = true
          } else if (latestStatus === "Failed") {
            hasFailed = true
          } else if (latestStatus === "Blocked") {
            hasBlocked = true
          } else if (latestStatus === "Warning") {
            hasWarning = true
          } else if (latestStatus === "Passed") {
            hasPassed = true
          }
        })

        if (hasBlocked) {
          blocked++
          coverageStatus = "Blocked"
        } else if (hasFailed) {
          failed++
          coverageStatus = "Failed"
          if (req.priority === "Critical") {
            failedCritical.push({ id: req.id, requirementKey: req.requirementKey, title: req.title })
          }
        } else if (hasNotExecuted) {
          if (hasPassed || hasFailed || hasWarning) {
            partiallyCovered++
            coverageStatus = "PartiallyCovered"
          } else {
            notExecuted++
            coverageStatus = "NotExecuted"
          }
        } else if (hasPassed) {
          covered++
          coverageStatus = "Covered"
        } else {
          notExecuted++
          coverageStatus = "NotExecuted"
        }
      }

      // Aggregate module/feature/component percentages
      const isReqCovered = coverageStatus === "Covered"
      
      if (req.module) {
        const key = req.module.name
        if (!moduleStats[key]) moduleStats[key] = { total: 0, covered: 0 }
        moduleStats[key].total++
        if (isReqCovered) moduleStats[key].covered++
      }
      if (req.feature) {
        const key = req.feature.name
        if (!featureStats[key]) featureStats[key] = { total: 0, covered: 0 }
        featureStats[key].total++
        if (isReqCovered) featureStats[key].covered++
      }
      if (req.component) {
        const key = req.component.name
        if (!componentStats[key]) componentStats[key] = { total: 0, covered: 0 }
        componentStats[key].total++
        if (isReqCovered) componentStats[key].covered++
      }
    })

    const coveragePercentage = total > 0 ? Math.round((covered / total) * 100) : 0

    return NextResponse.json({
      summary: {
        total,
        covered,
        partiallyCovered,
        uncovered,
        failed,
        blocked,
        notExecuted,
        coveragePercentage,
        requirementsWithBugs: withBugs
      },
      moduleCoverage: Object.entries(moduleStats).map(([name, stat]) => ({
        name,
        total: stat.total,
        covered: stat.covered,
        percent: stat.total > 0 ? Math.round((stat.covered / stat.total) * 100) : 0
      })),
      featureCoverage: Object.entries(featureStats).map(([name, stat]) => ({
        name,
        total: stat.total,
        covered: stat.covered,
        percent: stat.total > 0 ? Math.round((stat.covered / stat.total) * 100) : 0
      })),
      componentCoverage: Object.entries(componentStats).map(([name, stat]) => ({
        name,
        total: stat.total,
        covered: stat.covered,
        percent: stat.total > 0 ? Math.round((stat.covered / stat.total) * 100) : 0
      })),
      lists: {
        highPriorityNotCovered,
        failedCritical,
        noTestCases,
        openBugs
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate coverage summary" },
      { status: 500 }
    )
  }
}
