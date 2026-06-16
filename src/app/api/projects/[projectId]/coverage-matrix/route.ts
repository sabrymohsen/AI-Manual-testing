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
      },
      orderBy: { requirementKey: "asc" }
    })

    const matrix = requirements.map((req) => {
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

      if (links.length > 0) {
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
          coverageStatus = "Blocked"
        } else if (hasFailed) {
          coverageStatus = "Failed"
        } else if (hasNotExecuted) {
          if (hasPassed || hasFailed || hasWarning) {
            coverageStatus = "PartiallyCovered"
          } else {
            coverageStatus = "NotExecuted"
          }
        } else if (hasPassed) {
          coverageStatus = "Covered"
        } else {
          coverageStatus = "NotExecuted"
        }
      }

      // Calculate Risk Score
      // Rules:
      // - Critical requirement + no test cases = High Risk
      // - Critical requirement + failed tests = High Risk
      // - High requirement + open critical bug = High Risk
      // - Medium requirement + partial coverage = Medium Risk
      // - Covered and passed = Low Risk
      let risk = "Low"

      if (req.priority === "Critical" && links.length === 0) {
        risk = "High"
      } else if (req.priority === "Critical" && hasFailed) {
        risk = "High"
      } else if (req.priority === "High" && hasCriticalBugs) {
        risk = "High"
      } else if (req.priority === "Medium" && coverageStatus === "PartiallyCovered") {
        risk = "Medium"
      } else if (coverageStatus === "Failed" || coverageStatus === "Blocked") {
        risk = "High"
      } else if (coverageStatus === "Uncovered" || coverageStatus === "NotExecuted" || coverageStatus === "PartiallyCovered") {
        risk = "Medium"
      }

      return {
        id: req.id,
        requirementKey: req.requirementKey,
        title: req.title,
        priority: req.priority,
        module: req.module?.name || null,
        feature: req.feature?.name || null,
        component: req.component?.name || null,
        coverageStatus,
        risk,
        linkedTestCases: links.map((l) => ({
          id: l.testCase.id,
          title: l.testCase.title,
          priority: l.testCase.priority
        })),
        openBugs: bugs.map((b) => ({
          id: b.bugReport.id,
          title: b.bugReport.title,
          severity: b.bugReport.severity,
          priority: b.bugReport.priority
        }))
      }
    })

    return NextResponse.json({ matrix })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to retrieve coverage matrix" },
      { status: 500 }
    )
  }
}
