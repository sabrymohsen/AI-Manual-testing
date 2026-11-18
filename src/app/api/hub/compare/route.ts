import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { projectRunsWhere } from "@/lib/hub-runs"

export const dynamic = "force-dynamic"

type Outcome = "passed" | "failed" | "skipped" | "flaky"
const outcome = (s: string): Outcome =>
  s === "passed" ? "passed" : s === "skipped" ? "skipped" : s === "flaky" ? "flaky" : "failed"

/** Every test result in a run (single execution) or a batch, keyed by "script › test". */
async function collect(projectId: string, ref: string) {
  const execs = await prisma.testExecution.findMany({
    where: { AND: [projectRunsWhere(projectId), { OR: [{ id: ref }, { batchId: ref }] }] },
    select: { id: true, status: true, createdAt: true, results: true, script: { select: { name: true } } },
  })
  const map = new Map<string, Outcome>()
  for (const e of execs) {
    const results = Array.isArray(e.results) ? (e.results as any[]) : []
    if (!results.length) map.set(`${e.script?.name ?? "?"} › (whole run)`, e.status === "Passed" ? "passed" : "failed")
    for (const r of results) map.set(`${e.script?.name ?? "?"} › ${r.title}`, outcome(String(r.status)))
  }
  return { found: execs.length > 0, at: execs[0]?.createdAt ?? null, map }
}

/**
 * GET /api/hub/compare?projectId=&base=<run or batch id>&head=<run or batch id>
 *
 * What changed between two runs: newly failing, fixed, still failing, and
 * tests that only exist in one of them.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const auth = await requireHubProject(sp.get("projectId"), "read")
  if (!auth.ok) return auth.response
  const base = sp.get("base")
  const head = sp.get("head")
  if (!base || !head) return NextResponse.json({ error: "Choose two runs" }, { status: 400 })

  const [a, b] = await Promise.all([collect(auth.projectId, base), collect(auth.projectId, head)])
  if (!a.found || !b.found) return NextResponse.json({ error: "Run not found" }, { status: 404 })

  const out = { newlyFailing: [] as string[], fixed: [] as string[], stillFailing: [] as string[], added: [] as string[], removed: [] as string[], stillPassing: 0 }
  const bad = (o?: Outcome) => o === "failed"
  for (const [k, o] of b.map) {
    const before = a.map.get(k)
    if (!before) out.added.push(k)
    else if (bad(o) && !bad(before)) out.newlyFailing.push(k)
    else if (!bad(o) && bad(before)) out.fixed.push(k)
    else if (bad(o) && bad(before)) out.stillFailing.push(k)
    else out.stillPassing++
  }
  for (const k of a.map.keys()) if (!b.map.has(k)) out.removed.push(k)
  return NextResponse.json({ base: { ref: base, at: a.at }, head: { ref: head, at: b.at }, ...out })
}
