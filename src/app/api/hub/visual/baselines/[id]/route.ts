import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { VISUAL_ROOT, toPublicUrl } from "@/lib/hub-visual"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

// PUT /api/hub/visual/baselines/{id} — update tag / metadata
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const data: any = {}
    for (const k of ["versionTag", "pageName", "browser", "viewport", "testName"]) {
      if (body[k] !== undefined) data[k] = body[k]
    }
    const baseline = await prisma.visualBaseline.update({ where: { id: params.id }, data })
    return NextResponse.json({ baseline: { ...baseline, url: toPublicUrl(baseline.filePath) } })
  } catch (err: any) {
    console.error("PUT visual baseline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/visual/baselines/{id} — remove baseline row + stored PNG
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const baseline = await prisma.visualBaseline.findUnique({ where: { id: params.id } })
    if (!baseline) return NextResponse.json({ error: "Baseline not found" }, { status: 404 })

    // Only unlink files that live inside the managed visual store
    const resolved = path.resolve(baseline.filePath)
    if (resolved.startsWith(path.resolve(VISUAL_ROOT)) && fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved)
      } catch {}
    }
    await prisma.visualBaseline.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("DELETE visual baseline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
