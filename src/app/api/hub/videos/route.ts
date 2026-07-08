import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/videos — list video evidence (Video Lab gallery / clips).
// ?clips=exclude|only|all (default exclude), ?browser=, ?status=, ?q=
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sp = request.nextUrl.searchParams
    const clips = sp.get("clips") || "exclude"
    const status = sp.get("status")
    const q = sp.get("q")?.trim()

    const where: any = { fileType: "video" }
    if (status && status !== "all") where.status = status

    let videos = await prisma.evidenceFile.findMany({ where, orderBy: { createdAt: "desc" } })

    // Hydrate execution / script context
    const execIds = Array.from(new Set(videos.map((v) => v.testExecutionId)))
    const execs = await prisma.testExecution.findMany({
      where: { id: { in: execIds } },
      include: { script: { select: { name: true, type: true } } }
    })
    const execMap = new Map(execs.map((e) => [e.id, e]))

    let items = videos.map((v) => {
      const exec = execMap.get(v.testExecutionId)
      const isClip = v.tags.includes("clip")
      return {
        id: v.id,
        testName: exec?.script?.name || "Unknown test",
        browser: exec?.browser || null,
        status: v.status,
        executionStatus: exec?.status || null,
        stepNumber: v.stepNumber,
        pageUrl: v.pageUrl,
        description: v.elementLocator,
        tags: v.tags,
        isClip,
        createdAt: v.createdAt,
        fileExists: fs.existsSync(v.filePath),
        url: `/api/hub/evidence/${v.id}/file`
      }
    })

    if (clips === "exclude") items = items.filter((i) => !i.isClip)
    else if (clips === "only") items = items.filter((i) => i.isClip)

    if (q) {
      const ql = q.toLowerCase()
      items = items.filter((i) => i.testName.toLowerCase().includes(ql) || i.tags.some((t) => t.toLowerCase().includes(ql)))
    }

    const browsers = Array.from(new Set(items.map((i) => i.browser).filter(Boolean))).sort()
    return NextResponse.json({ videos: items, browsers })
  } catch (err: any) {
    console.error("GET videos error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
