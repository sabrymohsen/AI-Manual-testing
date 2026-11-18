import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// PUT /api/hub/targets/{id} — edit an execution target
export async function PUT(request: NextRequest, { params }: { params: { targetId: string } }) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { name, type, url, platform, browser, headless, credentials, isDefault } = body

    if (isDefault) {
      await prisma.executionTarget.updateMany({
        data: { isDefault: false },
        where: { isDefault: true, NOT: { id: params.targetId } }
      })
    }

    const target = await prisma.executionTarget.update({
      where: { id: params.targetId },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(url !== undefined && { url }),
        ...(platform !== undefined && { platform }),
        ...(browser !== undefined && { browser }),
        ...(headless !== undefined && { headless: Boolean(headless) }),
        ...(credentials !== undefined && { credentials: credentials || undefined }),
        ...(isDefault !== undefined && { isDefault: Boolean(isDefault) })
      }
    })

    return NextResponse.json({ target })
  } catch (err: any) {
    console.error("PUT hub target error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/targets/{id}
export async function DELETE(_request: NextRequest, { params }: { params: { targetId: string } }) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    await prisma.executionTarget.delete({ where: { id: params.targetId } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("DELETE hub target error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
