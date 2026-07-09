import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createRequirementSchema } from "@/schemas"
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
        epic: { select: { id: true, epicKey: true, title: true, status: true, priority: true } },
        feature: { select: { id: true, featureKey: true, name: true, epicId: true } },
        testCases: {
          include: {
            testCase: {
              include: {
                bugReports: {
                  select: { id: true, bugKey: true, title: true, severity: true, status: true },
                  orderBy: { createdAt: "desc" }
                },
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
        },
        subtasks: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
        },
        parent: { select: { id: true, requirementKey: true, title: true } },
        children: { select: { id: true, requirementKey: true, title: true, status: true } }
      },
      orderBy: [{ sprintId: "asc" }, { boardRank: "asc" }, { requirementKey: "asc" }]
    })

    const syncMappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "Requirement",
      },
    })
    const syncByReqId = new Map(syncMappings.map((m) => [m.localEntityId, m]))

    const resolvedRequirements = requirements.map((req) => {
      const links = req.testCases || []
      const bugs = req.bugReports || []
      const coverage = computeRequirementCoverage(links, bugs)

      const mapping = syncByReqId.get(req.id)
      return {
        ...req,
        computedCoverage: coverage.status,
        openBugsCount: bugs.length,
        openProjectSyncStatus: mapping
          ? (mapping.lastSyncStatus === "success" ? "Synced" : "Failed")
          : "NotSynced",
        openProjectWorkPackageUrl: mapping?.externalUrl || null
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
      epicId,
      featureId,
      figmaUrl,
      externalUrl,
      externalSystem,
      storyPoints,
      assignee,
      labels,
      sprintId,
      parentId
    } = parsed.data

    // Guard sprint ownership so a story can be dropped straight into a sprint.
    let resolvedSprintId: string | null = null
    if (sprintId) {
      const sprint = await prisma.sprint.findFirst({
        where: { id: sprintId, projectId: params.projectId }
      })
      if (!sprint) return badRequestResponse("Sprint not found in this project")
      resolvedSprintId = sprint.id
    }

    // Guard parent ownership (a Task/Bug hangs off a Story in the same project).
    let resolvedParentId: string | null = null
    if (parentId) {
      const parent = await prisma.requirement.findFirst({
        where: { id: parentId, projectId: params.projectId }
      })
      if (!parent) return badRequestResponse("Parent story not found in this project")
      resolvedParentId = parent.id
    }

    let resolvedEpicId = epicId || null
    if (epicId) {
      const epic = await prisma.epic.findFirst({
        where: { id: epicId, projectId: params.projectId }
      })
      if (!epic) {
        return badRequestResponse("Epic not found in this project")
      }
    }
    if (featureId) {
      const feature = await prisma.feature.findFirst({
        where: { id: featureId, projectId: params.projectId }
      })
      if (!feature) {
        return badRequestResponse("Feature not found in this project")
      }
      // Assigning a feature auto-aligns the story's epic
      if (!resolvedEpicId && feature.epicId) resolvedEpicId = feature.epicId
    }

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
        epicId: resolvedEpicId,
        featureId: featureId || null,
        figmaUrl: figmaUrl || null,
        externalUrl: externalUrl || null,
        externalSystem: externalSystem || null,
        storyPoints: storyPoints ?? null,
        assignee: assignee?.trim() || null,
        labels: labels || [],
        sprintId: resolvedSprintId,
        parentId: resolvedParentId
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
