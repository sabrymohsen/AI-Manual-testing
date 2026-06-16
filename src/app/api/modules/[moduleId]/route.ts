import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function PUT(
  request: Request,
  { params }: { params: { moduleId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Module name is required" }, { status: 400 })
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await prisma.projectModule.delete({
      where: { id: params.moduleId }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete module" }, { status: 500 })
  }
}
