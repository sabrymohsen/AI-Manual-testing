import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireVisualBaseline } from "@/lib/hub-access"
import { inVisualStore, baselineImageUrl } from "@/lib/hub-visual"
import * as fs from "fs"

export const dynamic = "force-dynamic"

function unlinkStored(p: string | null | undefined) {
  if (p && inVisualStore(p) && fs.existsSync(p)) {
    try {
      fs.unlinkSync(p)
    } catch {}
  }
}

// PUT /api/hub/visual/baselines/{id} — update tag / metadata
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireVisualBaseline(params.id, "write")
  if (!access.ok) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const data: any = {}
    for (const k of ["versionTag", "pageName", "browser", "viewport", "testName"]) {
      if (typeof body[k] === "string") data[k] = body[k]
    }
    const baseline = await prisma.visualBaseline.update({ where: { id: params.id }, data })
    return NextResponse.json({ baseline: { ...baseline, url: baselineImageUrl(baseline) } })
  } catch (err: any) {
    console.error("PUT visual baseline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/visual/baselines/{id} — remove the baseline, its comparisons
// and their stored PNGs
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireVisualBaseline(params.id, "write")
  if (!access.ok) return access.response

  try {
    const comparisons = await prisma.visualComparison.findMany({
      where: { baselineId: params.id },
      select: { currentFilePath: true, diffFilePath: true },
    })
    await prisma.visualBaseline.delete({ where: { id: params.id } })
    unlinkStored(access.baseline.filePath)
    for (const c of comparisons) {
      unlinkStored(c.currentFilePath)
      unlinkStored(c.diffFilePath)
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("DELETE visual baseline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
