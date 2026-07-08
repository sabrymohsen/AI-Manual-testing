import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { pngDimensions } from "@/lib/hub-visual"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// PUT /api/hub/visual/comparisons/{id} — { action: "approve" | "reject" }
// approve: promote the current image to be the new baseline.
// reject:  keep the baseline, mark the comparison rejected (test failed).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const { action } = await request.json().catch(() => ({}))
    const comparison = await prisma.visualComparison.findUnique({ where: { id: params.id } })
    if (!comparison) return NextResponse.json({ error: "Comparison not found" }, { status: 404 })

    if (action === "approve") {
      const baseline = await prisma.visualBaseline.findUnique({ where: { id: comparison.baselineId } })
      if (!baseline) return NextResponse.json({ error: "Baseline not found" }, { status: 404 })
      if (!fs.existsSync(comparison.currentFilePath)) {
        return NextResponse.json({ error: "Current image missing" }, { status: 404 })
      }
      // Promote current → baseline (overwrite the baseline PNG in place)
      fs.copyFileSync(comparison.currentFilePath, baseline.filePath)
      const dims = pngDimensions(baseline.filePath)
      await prisma.visualBaseline.update({
        where: { id: baseline.id },
        data: { width: dims?.width ?? baseline.width, height: dims?.height ?? baseline.height }
      })
      const updated = await prisma.visualComparison.update({ where: { id: params.id }, data: { status: "approved" } })
      return NextResponse.json({ comparison: updated })
    }

    if (action === "reject") {
      const updated = await prisma.visualComparison.update({ where: { id: params.id }, data: { status: "rejected" } })
      return NextResponse.json({ comparison: updated })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (err: any) {
    console.error("PUT visual comparison error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
