import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function PUT(
  request: Request,
  { params }: { params: { componentId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Component name is required" }, { status: 400 })
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await prisma.projectComponent.delete({
      where: { id: params.componentId }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete component" }, { status: 500 })
  }
}
