import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"
import { startBatchRun, startScriptRun, type ExecutionTargetLike } from "@/lib/hub-runner"
import { projectScriptsWhere } from "@/lib/hub-scripts"

export const dynamic = "force-dynamic"

async function resolveTarget(targetId?: string): Promise<ExecutionTargetLike | undefined> {
  if (!targetId || targetId === "local") return undefined
  const t = await prisma.executionTarget.findUnique({ where: { id: targetId } })
  return t ? { name: t.name, type: t.type, url: t.url, platform: t.platform, browser: t.browser, headless: t.headless } : undefined
}

// GET /api/hub/runs?projectId=&limit= — the project's run history, newest first.
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 })
  const auth = await requireProjectMember(projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50))
  const runs = await prisma.testExecution.findMany({
    where: { script: projectScriptsWhere(projectId) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      browser: true,
      duration: true,
      createdAt: true,
      batchId: true,
      executionTarget: true,
      results: true,
      script: { select: { id: true, name: true, folder: true, type: true } },
    },
  })
  return NextResponse.json({ runs })
}

// POST /api/hub/runs — run several tests together.
// { projectId, scriptIds?: string[], folder?: string, tag?: string, browser?, targetId? }
// No scriptIds/folder/tag means every test in the project.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const projectId = String(body.projectId || "")
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 })
  const auth = await requireProjectMember(projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const where: any = { AND: [projectScriptsWhere(projectId)] }
    if (Array.isArray(body.scriptIds) && body.scriptIds.length) where.AND.push({ id: { in: body.scriptIds.map(String) } })
    if (typeof body.folder === "string") where.AND.push({ folder: body.folder })
    if (typeof body.tag === "string" && body.tag) where.AND.push({ tags: { has: body.tag } })

    const scripts = await prisma.testScript.findMany({ where, orderBy: [{ folder: "asc" }, { name: "asc" }] })
    if (scripts.length === 0) return NextResponse.json({ error: "No tests match" }, { status: 404 })

    const browser = String(body.browser || "Headless")
    const target = await resolveTarget(body.targetId)

    if (scripts.length === 1) {
      const s = scripts[0]
      const id = await startScriptRun(s, browser, false, target, s.accessibilityEnabled)
      return NextResponse.json({ batchId: null, executionIds: [id] }, { status: 202 })
    }
    const batchId = randomUUID()
    const executionIds = await startBatchRun(scripts, { browser, target, batchId })
    return NextResponse.json({ batchId, executionIds }, { status: 202 })
  } catch (err: any) {
    console.error("POST hub runs error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
