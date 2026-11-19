import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { updateLocatorSchema } from "@/schemas"

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; locatorId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = updateLocatorSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const { friendlyName, description, locatorType, locatorValue } = parsed.data

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
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
