import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createRequirementSchema } from "@/schemas"

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
      },
      orderBy: { requirementKey: "asc" }
    })

    // Compute dynamic coverage status for every requirement
    const resolvedRequirements = requirements.map((req) => {
      const links = req.testCases || []
      const bugs = req.bugReports || []
      
      let coverageStatus = "Uncovered"
      let hasFailed = false
      let hasBlocked = false
      let hasWarning = false
      let hasNotExecuted = false
      let hasPassed = false

      // Check linked critical/high bugs
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

      return {
        ...req,
        computedCoverage: coverageStatus,
        openBugsCount: bugs.length
      }
    })

    return NextResponse.json({ requirements: resolvedRequirements })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch requirements" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = createRequirementSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const {
      requirementKey,
      title,
      description,
      acceptanceCriteria,
      priority,
      status,
      source,
      moduleId,
      featureId,
      componentId,
      figmaUrl,
      externalUrl,
      externalSystem
    } = parsed.data

    // Enforce uniqueness of key per project
    const existing = await prisma.requirement.findFirst({
      where: {
        projectId: params.projectId,
        requirementKey: requirementKey.trim()
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: `Requirement key '${requirementKey}' already exists in this project.` },
        { status: 400 }
      )
    }

    const requirement = await prisma.requirement.create({
      data: {
        projectId: params.projectId,
        requirementKey: requirementKey.trim(),
        title: title.trim(),
        description: description || null,
        acceptanceCriteria: acceptanceCriteria || null,
        priority: priority || "Medium",
        status: status || "Draft",
        source: source || "Manual",
        moduleId: moduleId || null,
        featureId: featureId || null,
        componentId: componentId || null,
        figmaUrl: figmaUrl || null,
        externalUrl: externalUrl || null,
        externalSystem: externalSystem || null
      }
    })

    return NextResponse.json({ requirement }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create requirement" },
      { status: 500 }
    )
  }
}
