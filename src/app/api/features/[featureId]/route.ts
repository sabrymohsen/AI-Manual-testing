import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function PUT(
  request: Request,
  { params }: { params: { featureId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Feature name is required" }, { status: 400 })
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await prisma.projectFeature.delete({
      where: { id: params.featureId }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete feature" }, { status: 500 })
  }
}
