import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { EXECUTION_LOG_SENTINEL } from "@/lib/hub-evidence"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/evidence — paginated, filterable evidence list.
// Filters: type, status, tag, since (ISO date), q (test name / page URL / locator), page, pageSize
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sp = request.nextUrl.searchParams
    const type = sp.get("type")
    const status = sp.get("status")
    const tag = sp.get("tag")
    const since = sp.get("since")
    const q = sp.get("q")?.trim()
    const page = Math.max(1, Number(sp.get("page")) || 1)
    const pageSize = Math.min(48, Number(sp.get("pageSize")) || 24)

    const where: any = {}
    if (type && type !== "all") where.fileType = type
    if (status && status !== "all") where.status = status
    if (tag) where.tags = { has: tag }
    if (since) where.createdAt = { gte: new Date(since) }

    if (q) {
      // match executions whose script name contains q
      const matchingExecutions = await prisma.testExecution.findMany({
        where: { script: { name: { contains: q, mode: "insensitive" } } },
        select: { id: true }
      })
      where.OR = [
        { pageUrl: { contains: q, mode: "insensitive" } },
        { elementLocator: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
        { testExecutionId: { in: matchingExecutions.map((e) => e.id) } }
      ]
    }

    const [total, items] = await Promise.all([
      prisma.evidenceFile.count({ where }),
      prisma.evidenceFile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    // Hydrate execution/script context for the cards
    const execIds = Array.from(new Set(items.map((i) => i.testExecutionId)))
    const executions = await prisma.testExecution.findMany({
      where: { id: { in: execIds } },
      include: { script: { select: { name: true, type: true } } }
    })
    const execMap = new Map(executions.map((e) => [e.id, e]))

    const evidence = items.map((item) => {
      const exec = execMap.get(item.testExecutionId)
      let lineCount: number | null = null
      if (item.fileType === "log" || item.fileType === "har") {
        if (item.filePath === EXECUTION_LOG_SENTINEL) {
          lineCount = exec ? exec.logOutput.split("\n").length : null
        } else if (fs.existsSync(item.filePath)) {
          try {
            lineCount = fs.readFileSync(item.filePath, "utf8").split("\n").length
          } catch {}
        }
      }
      return {
        ...item,
        testName: exec?.script?.name || "Unknown test",
        scriptType: exec?.script?.type || null,
        executionStatus: exec?.status || null,
        executionDuration: exec?.duration ?? null,
        lineCount,
        fileExists: item.filePath === EXECUTION_LOG_SENTINEL || fs.existsSync(item.filePath)
      }
    })

    // distinct tags for the filter dropdown
    const allTags = Array.from(new Set((await prisma.evidenceFile.findMany({ select: { tags: true } })).flatMap((r) => r.tags))).sort()

    return NextResponse.json({
      evidence,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      allTags
    })
  } catch (err: any) {
    console.error("GET hub evidence error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
