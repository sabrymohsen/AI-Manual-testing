import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// GET /api/hub/scripts/{id} — get script code + recent executions
export async function GET(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const script = await prisma.testScript.findUnique({
      where: { id: params.scriptId },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error("GET hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/scripts/{id} — update script
export async function PUT(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, type, code, tags, accessibilityEnabled } = body

    if (name && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return NextResponse.json({ error: "Script name must be a valid Java class name" }, { status: 400 })
    }

    const script = await prisma.testScript.update({
      where: { id: params.scriptId },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(code !== undefined && { code }),
        ...(tags !== undefined && { tags }),
        ...(accessibilityEnabled !== undefined && { accessibilityEnabled: Boolean(accessibilityEnabled) })
      }
    })

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error("PUT hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/scripts/{id}
export async function DELETE(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    await prisma.testScript.delete({
      where: { id: params.scriptId }
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("DELETE hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
