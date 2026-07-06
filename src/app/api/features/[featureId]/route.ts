import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"
import { createAuditLog } from "@/lib/auth/audit"

const updateFeatureSchema = z.object({
  featureKey: z.string().max(100).optional(),
  name: z.string().min(1).max(300).optional(),
  description: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  orderIndex: z.number().int().optional(),
})

async function loadOwnedFeature(featureId: string, userId: string) {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    include: {
      project: { select: { userId: true } },
      epic: { select: { id: true, epicKey: true, title: true } },
      requirements: { select: { id: true, requirementKey: true, title: true } }
    }
  })
  if (!feature) return { error: "not_found" as const }
  if (feature.project.userId !== userId) return { error: "forbidden" as const }
  return { feature }
}

export async function GET(
  request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const result = await loadOwnedFeature(params.featureId, auth.session!.user.id)
  if (result.error === "not_found") return notFoundResponse("Feature not found")
  if (result.error === "forbidden") return unauthorizedResponse("Access denied")

  return NextResponse.json({ feature: result.feature })
}

export async function PUT(
  request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await loadOwnedFeature(params.featureId, auth.session!.user.id)
    if (result.error === "not_found") return notFoundResponse("Feature not found")
    if (result.error === "forbidden") return unauthorizedResponse("Access denied")
    const feature = result.feature

    const body = await request.json()
    const parsed = updateFeatureSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { featureKey, name, description, epicId, orderIndex } = parsed.data

    if (epicId) {
      const epic = await prisma.epic.findFirst({
        where: { id: epicId, projectId: feature.projectId }
      })
      if (!epic) return badRequestResponse("Epic not found in this project")
    }

    if (featureKey && featureKey.trim() !== feature.featureKey) {
      const existing = await prisma.feature.findFirst({
        where: {
          projectId: feature.projectId,
          featureKey: featureKey.trim(),
          id: { not: feature.id }
        }
      })
      if (existing) {
        return NextResponse.json(
          { error: `Feature key '${featureKey}' already exists in this project.` },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.feature.update({
      where: { id: params.featureId },
      data: {
        featureKey: featureKey ? featureKey.trim() : undefined,
        name: name ? name.trim() : undefined,
        description: description !== undefined ? description : undefined,
        epicId: epicId !== undefined ? epicId : undefined,
        orderIndex: orderIndex !== undefined ? orderIndex : undefined
      },
      include: {
        epic: { select: { id: true, epicKey: true, title: true } },
        _count: { select: { requirements: true } }
      }
    })

    return NextResponse.json({ feature: updated })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update feature" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/features/[featureId]
 * Stories are kept and unassigned (DB-level SetNull). Cleans up the
 * feature's OpenProject sync config row, if any.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await loadOwnedFeature(params.featureId, auth.session!.user.id)
    if (result.error === "not_found") return notFoundResponse("Feature not found")
    if (result.error === "forbidden") return unauthorizedResponse("Access denied")
    const feature = result.feature

    await prisma.$transaction(async (tx) => {
      await tx.openProjectFeatureConfig.deleteMany({
        where: { projectId: feature.projectId, featureId: params.featureId }
      })
      await tx.feature.delete({ where: { id: params.featureId } })
    })

    await createAuditLog({
      action: "Delete Feature",
      details: `Deleted feature: ${feature.featureKey} - ${feature.name} (${feature.requirements.length} stories unassigned)`,
      userId: auth.session!.user.id,
      projectId: feature.projectId,
    })

    return NextResponse.json({
      message: "Feature deleted successfully",
      unassignedStories: feature.requirements.length
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete feature" },
      { status: 500 }
    )
  }
}
