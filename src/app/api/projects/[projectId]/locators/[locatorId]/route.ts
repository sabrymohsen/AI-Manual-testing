import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; locatorId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { friendlyName, description, locatorType, locatorValue } = body

  if (!friendlyName || !locatorType || !locatorValue) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const updated = await prisma.elementLocator.update({
      where: {
        id: params.locatorId,
        projectId: params.projectId,
      },
      data: {
        friendlyName,
        description: description || null,
        locatorType,
        locatorValue,
      },
    })

    return NextResponse.json({ locator: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update locator" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; locatorId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await prisma.elementLocator.delete({
      where: {
        id: params.locatorId,
        projectId: params.projectId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete locator" }, { status: 500 })
  }
}
