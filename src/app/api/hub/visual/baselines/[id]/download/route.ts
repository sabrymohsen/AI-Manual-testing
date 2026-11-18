import { NextRequest, NextResponse } from "next/server"
import { requireVisualBaseline } from "@/lib/hub-access"
import { inVisualStore } from "@/lib/hub-visual"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/visual/baselines/{id}/download — download the baseline PNG
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireVisualBaseline(params.id, "read")
  if (!access.ok) return access.response
  const baseline = access.baseline

  try {
    if (!inVisualStore(baseline.filePath) || !fs.existsSync(baseline.filePath)) {
      return NextResponse.json({ error: "Baseline file missing" }, { status: 404 })
    }
    const buffer = fs.readFileSync(baseline.filePath)
    const safe = `${baseline.testName}-${baseline.browser}`.replace(/[^a-zA-Z0-9._-]/g, "_")
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="baseline-${safe}.png"`,
      },
    })
  } catch (err: any) {
    console.error("GET baseline download error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
