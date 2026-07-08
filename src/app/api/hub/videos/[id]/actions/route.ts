import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { findTraceForTest, resolveTraceZip, unzipEntry, sanitizeJsonControlChars } from "@/lib/hub-traces"

export const dynamic = "force-dynamic"

// GET /api/hub/videos/{id}/actions — action markers for the player timeline,
// mapped from the matching shaft-trace (offset seconds relative to test start),
// plus the failure offset for "Jump to Failure".
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const video = await prisma.evidenceFile.findUnique({ where: { id: params.id } })
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 })

    const exec = await prisma.testExecution.findUnique({
      where: { id: video.testExecutionId },
      include: { script: { select: { name: true } } }
    })
    const testName = exec?.script?.name || ""

    const traceId = testName ? findTraceForTest(testName) : null
    const zip = traceId ? resolveTraceZip(traceId) : null
    if (!zip) return NextResponse.json({ actions: [], failureOffsetSec: null, testName })

    let trace: any
    try {
      trace = JSON.parse(sanitizeJsonControlChars(await unzipEntry(zip, "shaft-trace.json")))
    } catch {
      return NextResponse.json({ actions: [], failureOffsetSec: null, testName })
    }

    const raw: any[] = Array.isArray(trace.actions) ? trace.actions : []
    if (raw.length === 0) return NextResponse.json({ actions: [], failureOffsetSec: null, testName })

    const first = new Date(raw[0].startTime).getTime()
    let failureOffsetSec: number | null = null
    const actions = raw.map((a, i) => {
      const offsetSec = Math.max(0, (new Date(a.startTime).getTime() - first) / 1000)
      if (a.status === "failed" && failureOffsetSec === null) failureOffsetSec = offsetSec
      return {
        index: i,
        name: a.name,
        category: a.category,
        status: a.status,
        offsetSec: Math.round(offsetSec * 100) / 100,
        durationMs: a.durationMs || 0
      }
    })

    return NextResponse.json({ actions, failureOffsetSec, testName })
  } catch (err: any) {
    console.error("GET video actions error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
