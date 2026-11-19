import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { computeRequirementCoverage } from "@/lib/coverage"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirements = await prisma.requirement.findMany({
      where: { projectId: params.projectId },
      include: {
        epic: { select: { id: true, epicKey: true, title: true, status: true, priority: true } },
        feature: { select: { id: true, featureKey: true, name: true } },
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

      const { status: coverageStatus, hasFailed, hasCriticalBugs } =
        computeRequirementCoverage(links, bugs)

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
        epic: req.epic
          ? { id: req.epic.id, epicKey: req.epic.epicKey, title: req.epic.title }
          : null,
        feature: req.feature ? `${req.feature.featureKey} — ${req.feature.name}` : null,
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
