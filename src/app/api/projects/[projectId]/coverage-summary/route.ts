import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { computeRequirementCoverage } from "@/lib/coverage"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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

      const { status: coverageStatus } = computeRequirementCoverage(links, bugs)

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
      } else if (coverageStatus === "Blocked") {
        blocked++
      } else if (coverageStatus === "Failed") {
        failed++
        if (req.priority === "Critical") {
          failedCritical.push({ id: req.id, requirementKey: req.requirementKey, title: req.title })
        }
      } else if (coverageStatus === "PartiallyCovered") {
        partiallyCovered++
      } else if (coverageStatus === "Covered") {
        covered++
      } else {
        notExecuted++
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
