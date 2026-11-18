import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { projectRunsWhere, startScopedRun } from "@/lib/hub-runs"
import { queuePosition } from "@/lib/hub-runner"

export const dynamic = "force-dynamic"

/**
 * GET /api/hub/runs?projectId=&q=&status=&from=&to=&source=&cursor=&limit=
 *
 * The project's run history, newest first, with search (test name), status,
 * date range and trigger filters, paginated by cursor. Only runs made in this
 * project — a shared example's runs in other projects are not included.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const projectId = sp.get("projectId")
  const auth = await requireHubProject(projectId, "read")
  if (!auth.ok) return auth.response

  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50))
  const and: any[] = [projectRunsWhere(auth.projectId)]
  const q = sp.get("q")?.trim()
  if (q) and.push({ script: { OR: [{ name: { contains: q, mode: "insensitive" } }, { folder: { contains: q, mode: "insensitive" } }] } })
  const status = sp.get("status")
  if (status) and.push({ status })
  const source = sp.get("source")
  if (source) and.push({ triggerSource: source })
  const from = sp.get("from")
  const to = sp.get("to")
  if (from || to) {
    and.push({
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        // "to" is a date: include the whole day.
        ...(to ? { lt: new Date(new Date(to).getTime() + 86_400_000) } : {}),
      },
    })
  }
  const cursor = sp.get("cursor")

  const rows = await prisma.testExecution.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      browser: true,
      duration: true,
      createdAt: true,
      batchId: true,
      executionTarget: true,
      results: true,
      triggerSource: true,
      triggeredByName: true,
      script: { select: { id: true, name: true, folder: true, type: true } },
    },
  })
  const page = rows.slice(0, limit)
  return NextResponse.json({
    runs: page.map((r) => ({ ...r, queuePosition: r.status === "Queued" ? queuePosition(r.id) : null })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  })
}

/**
 * POST /api/hub/runs — run tests together.
 * { projectId, scriptIds?, folder?, tag?, rerunFailedOfBatch?, rerunExecutionIds?, browser?, targetId? }
 * No scope means every test in the project.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(String(body.projectId || ""), "write")
  if (!auth.ok) return auth.response

  try {
    const rerun = !!(body.rerunFailedOfBatch || body.rerunExecutionIds?.length)
    const res = await startScopedRun(
      auth.projectId,
      {
        scriptIds: Array.isArray(body.scriptIds) ? body.scriptIds.map(String) : undefined,
        folder: typeof body.folder === "string" ? body.folder : undefined,
        tag: typeof body.tag === "string" && body.tag ? body.tag : undefined,
        rerunFailedOfBatch: typeof body.rerunFailedOfBatch === "string" ? body.rerunFailedOfBatch : undefined,
        rerunExecutionIds: Array.isArray(body.rerunExecutionIds) ? body.rerunExecutionIds.map(String) : undefined,
      },
      {
        browser: body.browser,
        targetId: body.targetId,
        meta: {
          triggerSource: rerun ? "rerun" : "manual",
          triggeredById: auth.session.user.id,
          triggeredByName: auth.session.user.name || auth.session.user.email,
        },
      }
    )
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: 404 })
    return NextResponse.json(res, { status: 202 })
  } catch (err: any) {
    console.error("POST hub runs error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
