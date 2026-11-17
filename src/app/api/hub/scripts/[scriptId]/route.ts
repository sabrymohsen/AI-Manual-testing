import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { cleanFolder, hubNameError } from "@/lib/hub-scripts"

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
          take: 20,
          select: { id: true, status: true, duration: true, createdAt: true, browser: true, batchId: true, results: true }
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
    const { type, code, tags, accessibilityEnabled } = body
    const name = typeof body.name === "string" ? body.name.trim() : undefined

    if (name !== undefined) {
      const nameError = hubNameError(name)
      if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })
      const current = await prisma.testScript.findUnique({ where: { id: params.scriptId }, select: { projectId: true } })
      const clash = await prisma.testScript.findFirst({
        where: {
          id: { not: params.scriptId },
          name: { equals: name, mode: "insensitive" },
          ...(current?.projectId ? { OR: [{ projectId: current.projectId }, { projectId: null }] } : {}),
        },
      })
      if (clash) return NextResponse.json({ error: `A test named "${name}" already exists` }, { status: 409 })
    }

    const script = await prisma.testScript.update({
      where: { id: params.scriptId },
      data: {
        ...(name !== undefined && { name }),
        ...(body.folder !== undefined && { folder: cleanFolder(body.folder) }),
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
