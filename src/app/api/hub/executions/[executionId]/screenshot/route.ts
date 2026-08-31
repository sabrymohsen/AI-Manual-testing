import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

// Guard shared with the evidence routes rather than a second hardcoded copy
// of one machine's home directory.
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"

// GET /api/hub/executions/{id}/screenshot — serve the captured screenshot evidence
export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const execution = await prisma.testExecution.findUnique({
      where: { id: params.executionId },
      select: { screenshotPath: true }
    })

    if (!execution?.screenshotPath) {
      return NextResponse.json({ error: "No screenshot available" }, { status: 404 })
    }

    const resolved = path.resolve(execution.screenshotPath)
    if (!resolved.startsWith(ARTIFACT_ROOT) || !fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Screenshot file missing" }, { status: 404 })
    }

    const buffer = fs.readFileSync(resolved)
    const contentType = resolved.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600"
      }
    })
  } catch (err: any) {
    console.error("GET hub screenshot error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
