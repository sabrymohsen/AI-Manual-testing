import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: {
        project: true,
        module: true,
        feature: true,
        component: true,
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

    if (!requirement) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 })
    }

    // Build breadcrumbs path: Module / Feature / Component
    const pathParts = []
    if (requirement.module) pathParts.push(requirement.module.name)
    if (requirement.feature) pathParts.push(requirement.feature.name)
    if (requirement.component) pathParts.push(requirement.component.name)
    const breadcrumbPath = pathParts.join(" / ")

    // Compute dynamic coverage status for this single requirement
    const links = requirement.testCases || []
    const bugs = requirement.bugReports || []
    
    let coverageStatus = "Uncovered"
    let hasFailed = false
    let hasBlocked = false
    let hasWarning = false
    let hasNotExecuted = false
    let hasPassed = false

    const hasCriticalBugs = bugs.some(
      (b: any) => b.bugReport.severity === "Critical" || b.bugReport.severity === "High"
    )
    if (hasCriticalBugs) {
      hasBlocked = true
    }

    if (links.length > 0) {
      links.forEach((link: any) => {
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

    return NextResponse.json({
      requirement: {
        ...requirement,
        breadcrumbPath,
        computedCoverage: coverageStatus,
        openBugsCount: bugs.length
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch requirement details" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId }
    })

    if (!requirement) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      requirementKey,
      title,
      description,
      acceptanceCriteria,
      priority,
      status,
      moduleId,
      featureId,
      componentId,
      figmaUrl,
      externalUrl,
      externalSystem
    } = body

    if (requirementKey && requirementKey.trim() !== requirement.requirementKey) {
      // Validate key uniqueness
      const existing = await prisma.requirement.findFirst({
        where: {
          projectId: requirement.projectId,
          requirementKey: requirementKey.trim(),
          id: { not: requirement.id }
        }
      })
      if (existing) {
        return NextResponse.json(
          { error: `Requirement key '${requirementKey}' already exists in this project.` },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.requirement.update({
      where: { id: params.requirementId },
      data: {
        requirementKey: requirementKey ? requirementKey.trim() : undefined,
        title: title ? title.trim() : undefined,
        description: description !== undefined ? description : undefined,
        acceptanceCriteria: acceptanceCriteria !== undefined ? acceptanceCriteria : undefined,
        priority: priority || undefined,
        status: status || undefined,
        moduleId: moduleId !== undefined ? moduleId : undefined,
        featureId: featureId !== undefined ? featureId : undefined,
        componentId: componentId !== undefined ? componentId : undefined,
        figmaUrl: figmaUrl !== undefined ? figmaUrl : undefined,
        externalUrl: externalUrl !== undefined ? externalUrl : undefined,
        externalSystem: externalSystem !== undefined ? externalSystem : undefined
      }
    })

    return NextResponse.json({ requirement: updated })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update requirement" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId }
    })

    if (!requirement) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 })
    }

    await prisma.requirement.delete({
      where: { id: params.requirementId }
    })

    return NextResponse.json({ message: "Requirement deleted successfully" })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete requirement" },
      { status: 500 }
    )
  }
}
