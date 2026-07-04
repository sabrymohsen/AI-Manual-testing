import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, badRequestResponse } from "@/lib/api-guards"
import { updateEpicSchema } from "@/schemas"

import { createAuditLog } from "@/lib/auth/audit"

async function loadOwnedEpic(epicId: string, userId: string) {
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    include: {
      project: { select: { userId: true } },
      requirements: { select: { id: true, requirementKey: true, title: true } }
    }
  })
  if (!epic) return { error: "not_found" as const }
  if (epic.project.userId !== userId) return { error: "forbidden" as const }
  return { epic }
}

export async function GET(
  request: Request,
  { params }: { params: { epicId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const result = await loadOwnedEpic(params.epicId, auth.session!.user.id)
  if (result.error === "not_found") return notFoundResponse("Epic not found")
  if (result.error === "forbidden") return unauthorizedResponse("Access denied")

  return NextResponse.json({ epic: result.epic })
}

export async function PUT(
  request: Request,
  { params }: { params: { epicId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await loadOwnedEpic(params.epicId, auth.session!.user.id)
    if (result.error === "not_found") return notFoundResponse("Epic not found")
    if (result.error === "forbidden") return unauthorizedResponse("Access denied")
    const epic = result.epic

    const body = await request.json()
    const parsed = updateEpicSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { epicKey, title, description, priority, status, orderIndex } = parsed.data

    if (epicKey && epicKey.trim() !== epic.epicKey) {
      const existing = await prisma.epic.findFirst({
        where: {
          projectId: epic.projectId,
          epicKey: epicKey.trim(),
          id: { not: epic.id }
        }
      })
      if (existing) {
        return NextResponse.json(
          { error: `Epic key '${epicKey}' already exists in this project.` },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.epic.update({
      where: { id: params.epicId },
      data: {
        epicKey: epicKey ? epicKey.trim() : undefined,
        title: title ? title.trim() : undefined,
        description: description !== undefined ? description : undefined,
        priority: priority || undefined,
        status: status || undefined,
        orderIndex: orderIndex !== undefined ? orderIndex : undefined
      },
      include: { _count: { select: { requirements: true } } }
    })

    return NextResponse.json({ epic: updated })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update epic" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/epics/[epicId]?deleteStories=true
 *
 * Default: stories are kept and orphaned (DB-level SetNull).
 * deleteStories=true: linked requirements are deleted first (their
 * TestCaseRequirement/BugReportRequirement join rows cascade; test cases
 * and bugs themselves are untouched). Orphaned ExternalSyncMapping rows
 * are cleaned up in both paths.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { epicId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await loadOwnedEpic(params.epicId, auth.session!.user.id)
    if (result.error === "not_found") return notFoundResponse("Epic not found")
    if (result.error === "forbidden") return unauthorizedResponse("Access denied")
    const epic = result.epic

    const deleteStories =
      new URL(request.url).searchParams.get("deleteStories") === "true"
    const storyIds = epic.requirements.map(r => r.id)

    await prisma.$transaction(async (tx) => {
      if (deleteStories && storyIds.length > 0) {
        await tx.externalSyncMapping.deleteMany({
          where: { localEntityType: "Requirement", localEntityId: { in: storyIds } }
        })
        await tx.requirement.deleteMany({ where: { id: { in: storyIds } } })
        
        for (const r of epic.requirements) {
          await createAuditLog({
            action: "Delete Requirement",
            details: `Deleted requirement via epic deletion: ${r.requirementKey} - ${r.title}`,
            userId: auth.session!.user.id,
            projectId: epic.projectId
          })
        }
      }
      await tx.externalSyncMapping.deleteMany({
        where: { localEntityType: "Epic", localEntityId: params.epicId }
      })
      await tx.epic.delete({ where: { id: params.epicId } })
      
      await createAuditLog({
        action: "Delete Epic",
        details: `Deleted epic: ${epic.epicKey} - ${epic.title} (deleted ${deleteStories ? storyIds.length : 0} associated stories)`,
        userId: auth.session!.user.id,
        projectId: epic.projectId
      })
    })

    return NextResponse.json({
      message: "Epic deleted successfully",
      deletedStories: deleteStories ? storyIds.length : 0,
      unlinkedStories: deleteStories ? 0 : storyIds.length
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete epic" },
      { status: 500 }
    )
  }
}
