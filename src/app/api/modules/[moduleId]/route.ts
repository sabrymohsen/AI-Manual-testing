import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

export async function PUT(
  request: Request,
  { params }: { params: { moduleId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    if (!body.name) {
      return badRequestResponse("Module name is required")
    }

    const module = await prisma.projectModule.findFirst({
      where: { id: params.moduleId, project: { userId: auth.session!.user.id } }
    })
    if (!module) {
      return notFoundResponse("Module not found")
    }

    const updated = await prisma.projectModule.update({
      where: { id: params.moduleId },
      data: {
        name: body.name,
        description: body.description !== undefined ? body.description : undefined,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : undefined
      }
    })
    return NextResponse.json({ module: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update module" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { moduleId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const module = await prisma.projectModule.findFirst({
      where: { id: params.moduleId, project: { userId: auth.session!.user.id } }
    })
    if (!module) {
      return notFoundResponse("Module not found")
    }

    await prisma.projectModule.delete({
      where: { id: params.moduleId }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete module" }, { status: 500 })
  }
}
