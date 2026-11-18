import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"
import { EXECUTION_LOG_SENTINEL, ARTIFACT_ROOT } from "@/lib/hub-evidence"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".har": "application/json",
  ".json": "application/json",
  ".log": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
}

// GET /api/hub/evidence/{id}/file — serve the evidence file inline
// (thumbnails, video playback, log/HAR content). Supports HTTP Range for video.
export async function GET(
  request: NextRequest,
  { params }: { params: { evidenceId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const item = await prisma.evidenceFile.findUnique({ where: { id: params.evidenceId } })
    if (!item) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 })
    }
    // Only members of the run's project may see it.
    if (item && !(await executionVisibleTo(auth.session!.user.id, item.testExecutionId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Maven console log lives in the DB, not on disk
    if (item.filePath === EXECUTION_LOG_SENTINEL) {
      const exec = await prisma.testExecution.findUnique({
        where: { id: item.testExecutionId },
        select: { logOutput: true }
      })
      return new NextResponse(exec?.logOutput || "", {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=300" }
      })
    }

    const resolved = path.resolve(item.filePath)
    if (!resolved.startsWith(ARTIFACT_ROOT) || !fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Evidence file missing on disk" }, { status: 404 })
    }

    const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream"
    const stat = fs.statSync(resolved)

    // Basic Range support so <video> can seek
    const range = request.headers.get("range")
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = Number(match[1])
        const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1
        if (start <= end && start < stat.size) {
          const fd = fs.openSync(resolved, "r")
          const length = end - start + 1
          const buffer = Buffer.alloc(length)
          fs.readSync(fd, buffer, 0, length, start)
          fs.closeSync(fd)
          return new NextResponse(buffer as any, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(length)
            }
          })
        }
      }
    }

    const buffer = fs.readFileSync(resolved)
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600"
      }
    })
  } catch (err: any) {
    console.error("GET evidence file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
