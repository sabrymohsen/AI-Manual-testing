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
        module: { select: { id: true, name: true } },
        feature: { select: { id: true, name: true } },
        component: { select: { id: true, name: true } },
        testCases: {
          include: {
            testCase: {
              include: {
                // Bugs raised against this test case — powers the
                // story → test case → bug traceability view.
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
        }
      },
      orderBy: { requirementKey: "asc" }
    })

    // OpenProject sync state for the story rows (badge + WP link in the UI).
    const syncMappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "Requirement",
      },
    })
    const syncByReqId = new Map(syncMappings.map((m) => [m.localEntityId, m]))

    // Compute dynamic coverage status for every requirement
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
      moduleId,
      featureId,
      componentId,
      figmaUrl,
      externalUrl,
      externalSystem
    } = parsed.data

    if (epicId) {
      const epic = await prisma.epic.findFirst({
        where: { id: epicId, projectId: params.projectId }
      })
      if (!epic) {
        return badRequestResponse("Epic not found in this project")
      }
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
        epicId: epicId || null,
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
