import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/visual/baselines/{id}/download — download the baseline PNG
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const baseline = await prisma.visualBaseline.findUnique({ where: { id: params.id } })
    if (!baseline || !fs.existsSync(baseline.filePath)) {
      return NextResponse.json({ error: "Baseline file missing" }, { status: 404 })
    }
    const buffer = fs.readFileSync(baseline.filePath)
    const safe = `${baseline.testName}-${baseline.browser}`.replace(/[^a-zA-Z0-9._-]/g, "_")
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="baseline-${safe}.png"`
      }
    })
  } catch (err: any) {
    console.error("GET baseline download error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
