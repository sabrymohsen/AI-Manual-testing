import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"

export const dynamic = "force-dynamic"

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "video/webm",
  ".zip": "application/zip",
}

// GET /api/hub/executions/{id}/artifact?test=<index>&kind=screenshot|video|trace
// Serves one test's screenshot, video or trace from the run's results. Only
// paths recorded on the run and inside the hub workspace are ever served.
export async function GET(request: NextRequest, { params }: { params: { executionId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const index = Number(request.nextUrl.searchParams.get("test"))
  const kind = request.nextUrl.searchParams.get("kind") || ""
  if (!["screenshot", "video", "trace"].includes(kind) || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Use ?test=<index>&kind=screenshot|video|trace" }, { status: 400 })
  }

  const execution = await prisma.testExecution.findUnique({ where: { id: params.executionId }, select: { results: true } })
  const result = Array.isArray(execution?.results) ? (execution!.results as any[])[index] : null
  const file: string | undefined = result?.[kind]
  if (!file) return NextResponse.json({ error: "Not recorded for this test" }, { status: 404 })

  const resolved = path.resolve(file)
  if (!resolved.startsWith(ARTIFACT_ROOT + path.sep) || !fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File no longer available" }, { status: 404 })
  }

  const stat = fs.statSync(resolved)
  const type = TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream"
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(stat.size),
    "Cache-Control": "private, max-age=3600",
  }
  if (kind === "trace") headers["Content-Disposition"] = `attachment; filename="trace-${params.executionId.slice(0, 8)}-${index + 1}.zip"`
  return new NextResponse(fs.readFileSync(resolved), { headers })
}
