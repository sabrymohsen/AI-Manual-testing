import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { computeRequirementCoverage } from "@/lib/coverage"
import { createAuditLog } from "@/lib/auth/audit"

const putBodySchema = z.object({
  requirementKey: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  status: z.enum(["Draft", "ReadyForTesting", "InTesting", "Covered", "PartiallyCovered", "Failed", "Blocked", "Deprecated"]).optional(),
  epicId: z.string().optional().nullable(),
  featureId: z.string().optional().nullable(),
  figmaUrl: z.string().optional().nullable(),
  externalUrl: z.string().optional().nullable(),
  externalSystem: z.string().optional().nullable(),
  // Scrum board fields
  storyPoints: z.number().int().min(0).max(999).optional().nullable(),
  assignee: z.string().optional().nullable(),
  labels: z.array(z.string()).optional(),
  sprintId: z.string().optional().nullable(),
  boardRank: z.number().int().optional().nullable(),
  parentId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  timeEstimate: z.number().int().optional().nullable(),
  timeSpent: z.number().int().optional().nullable(),
})

export async function GET(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: {
        project: { select: { userId: true } },
        epic: { select: { id: true, epicKey: true, title: true } },
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
      }
    })

    if (!requirement) {
      return notFoundResponse("Requirement not found")
    }

    if (requirement.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    // Build breadcrumbs path: Epic / Feature
    const pathParts = []
    if (requirement.epic) pathParts.push(`${requirement.epic.epicKey} ${requirement.epic.title}`)
    if (requirement.feature) pathParts.push(requirement.feature.name)
    const breadcrumbPath = pathParts.join(" / ")

    // Compute dynamic coverage status for this single requirement
    const links = requirement.testCases || []
    const bugs = requirement.bugReports || []
    const coverage = computeRequirementCoverage(links, bugs)

    return NextResponse.json({
      requirement: {
        ...requirement,
        breadcrumbPath,
        computedCoverage: coverage.status,
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
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: { project: { select: { userId: true } } }
    })

    if (!requirement) {
      return notFoundResponse("Requirement not found")
    }

    if (requirement.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = putBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const {
      requirementKey,
      title,
      description,
      acceptanceCriteria,
      priority,
      status,
      figmaUrl,
      externalUrl,
      externalSystem
    } = body
    let { epicId, featureId } = body as { epicId?: string | null; featureId?: string | null }

    if (epicId) {
      const epic = await prisma.epic.findFirst({
        where: { id: epicId, projectId: requirement.projectId }
      })
      if (!epic) {
        return NextResponse.json({ error: "Epic not found in this project" }, { status: 400 })
      }
    }

    if (featureId) {
      const feature = await prisma.feature.findFirst({
        where: { id: featureId, projectId: requirement.projectId }
      })
      if (!feature) {
        return NextResponse.json({ error: "Feature not found in this project" }, { status: 400 })
      }
      // Assigning a feature auto-aligns the story's epic to the feature's epic
      if (feature.epicId && epicId === undefined) {
        epicId = feature.epicId
      }
    }

    if (body.sprintId) {
      const sprint = await prisma.sprint.findFirst({
        where: { id: body.sprintId, projectId: requirement.projectId }
      })
      if (!sprint) {
        return NextResponse.json({ error: "Sprint not found in this project" }, { status: 400 })
      }
    }

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
        epicId: epicId !== undefined ? epicId : undefined,
        featureId: featureId !== undefined ? featureId : undefined,
        figmaUrl: figmaUrl !== undefined ? figmaUrl : undefined,
        externalUrl: externalUrl !== undefined ? externalUrl : undefined,
        externalSystem: externalSystem !== undefined ? externalSystem : undefined,
        storyPoints: body.storyPoints !== undefined ? body.storyPoints : undefined,
        assignee: body.assignee !== undefined ? body.assignee : undefined,
        labels: body.labels !== undefined ? body.labels : undefined,
        sprintId: body.sprintId !== undefined ? body.sprintId : undefined,
        boardRank: body.boardRank !== undefined ? body.boardRank : undefined,
        parentId: body.parentId !== undefined ? body.parentId : undefined,
        dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
        timeEstimate: body.timeEstimate !== undefined ? (body.timeEstimate != null ? Number(body.timeEstimate) : null) : undefined,
        timeSpent: body.timeSpent !== undefined ? (body.timeSpent != null ? Number(body.timeSpent) : null) : undefined,
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
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: { project: { select: { userId: true } } }
    })

    if (!requirement) {
      return notFoundResponse("Requirement not found")
    }

    if (requirement.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    // Remove sync mappings first — no FK ties them to the requirement, so a
    // plain delete would leave orphaned rows behind.
    await prisma.$transaction(async (tx) => {
      await tx.externalSyncMapping.deleteMany({
        where: { localEntityType: "Requirement", localEntityId: params.requirementId }
      })
      await tx.requirement.delete({
        where: { id: params.requirementId }
      })
      await createAuditLog({
        action: "Delete Requirement",
        details: `Deleted requirement: ${requirement.requirementKey} - ${requirement.title}`,
        userId: auth.session!.user.id,
        projectId: requirement.projectId
      })
    })

    return NextResponse.json({ message: "Requirement deleted successfully" })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete requirement" },
      { status: 500 }
    )
  }
}
