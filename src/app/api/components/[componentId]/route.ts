import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

export async function PUT(
  request: Request,
  { params }: { params: { componentId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    if (!body.name) {
      return badRequestResponse("Component name is required")
    }

    const component = await prisma.projectComponent.findFirst({
      where: { id: params.componentId, project: { userId: auth.session!.user.id } }
    })
    if (!component) {
      return notFoundResponse("Component not found")
    }

    const updated = await prisma.projectComponent.update({
      where: { id: params.componentId },
      data: {
        name: body.name,
        description: body.description !== undefined ? body.description : undefined,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : undefined
      }
    })
    return NextResponse.json({ component: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update component" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { componentId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const component = await prisma.projectComponent.findFirst({
      where: { id: params.componentId, project: { userId: auth.session!.user.id } }
    })
    if (!component) {
      return notFoundResponse("Component not found")
    }

    await prisma.projectComponent.delete({
      where: { id: params.componentId }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete component" }, { status: 500 })
  }
}
