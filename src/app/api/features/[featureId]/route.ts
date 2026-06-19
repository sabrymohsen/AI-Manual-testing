import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

export async function PUT(
  request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    if (!body.name) {
      return badRequestResponse("Feature name is required")
    }

    const feature = await prisma.projectFeature.findFirst({
      where: { id: params.featureId, project: { userId: auth.session!.user.id } }
    })
    if (!feature) {
      return notFoundResponse("Feature not found")
    }

    const updated = await prisma.projectFeature.update({
      where: { id: params.featureId },
      data: {
        name: body.name,
        description: body.description !== undefined ? body.description : undefined,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : undefined
      }
    })
    return NextResponse.json({ feature: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update feature" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const feature = await prisma.projectFeature.findFirst({
      where: { id: params.featureId, project: { userId: auth.session!.user.id } }
    })
    if (!feature) {
      return notFoundResponse("Feature not found")
    }

    await prisma.projectFeature.delete({
      where: { id: params.featureId }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete feature" }, { status: 500 })
  }
}
