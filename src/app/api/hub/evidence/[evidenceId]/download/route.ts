import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"
import { EXECUTION_LOG_SENTINEL, ARTIFACT_ROOT } from "@/lib/hub-evidence"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

// GET /api/hub/evidence/{id}/download — download the evidence file as an attachment
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

    if (item.filePath === EXECUTION_LOG_SENTINEL) {
      const exec = await prisma.testExecution.findUnique({
        where: { id: item.testExecutionId },
        select: { logOutput: true }
      })
      return new NextResponse(exec?.logOutput || "", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="execution-${item.testExecutionId.slice(0, 8)}-maven.log"`
        }
      })
    }

    const resolved = path.resolve(item.filePath)
    if (!resolved.startsWith(ARTIFACT_ROOT) || !fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Evidence file missing on disk" }, { status: 404 })
    }

    const buffer = fs.readFileSync(resolved)
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${path.basename(resolved).replace(/"/g, "")}"`
      }
    })
  } catch (err: any) {
    console.error("GET evidence download error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
