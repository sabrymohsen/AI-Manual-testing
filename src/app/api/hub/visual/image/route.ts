import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireVisualBaseline } from "@/lib/hub-access"
import { inVisualStore } from "@/lib/hub-visual"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/visual/image?kind=baseline|current|diff&id= — serve a Visual
// Diff PNG to members of the baseline's project.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const kind = sp.get("kind")
  const id = sp.get("id") || ""
  const notFound = () => NextResponse.json({ error: "Image not found" }, { status: 404 })

  let baselineId: string
  let filePath: string | null = null
  if (kind === "baseline") {
    baselineId = id
  } else if (kind === "current" || kind === "diff") {
    const c = await prisma.visualComparison.findUnique({ where: { id } })
    if (!c) return notFound()
    baselineId = c.baselineId
    filePath = kind === "current" ? c.currentFilePath : c.diffFilePath
  } else {
    return NextResponse.json({ error: "kind must be baseline, current or diff" }, { status: 400 })
  }

  const access = await requireVisualBaseline(baselineId, "read")
  if (!access.ok) return access.response.status === 404 ? notFound() : access.response
  if (kind === "baseline") filePath = access.baseline.filePath

  if (!filePath || !inVisualStore(filePath) || !fs.existsSync(filePath)) return notFound()
  return new NextResponse(fs.readFileSync(filePath) as any, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
