import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyCiRequest } from "@/lib/hub-ci"

export const dynamic = "force-dynamic"

/**
 * GET /api/hub/ci/status?ref=<batchId or executionId>
 * Authorization: Bearer <project CI token>
 *
 * { state: "running" | "passed" | "failed" | "cancelled", passed, failed, total, failures[] }
 * A pipeline polls this until state isn't "running", then fails the job on
 * "failed"/"cancelled".
 */
export async function GET(request: Request) {
  const token = await verifyCiRequest(request)
  if (!token) return NextResponse.json({ error: "Invalid or revoked token" }, { status: 401 })
  const ref = new URL(request.url).searchParams.get("ref")
  if (!ref) return NextResponse.json({ error: "ref is required" }, { status: 400 })

  const runs = await prisma.testExecution.findMany({
    where: { projectId: token.projectId, OR: [{ id: ref }, { batchId: ref }] },
    select: { id: true, status: true, results: true, script: { select: { name: true } } },
  })
  if (!runs.length) return NextResponse.json({ error: "Run not found" }, { status: 404 })

  const active = runs.some((r) => r.status === "Queued" || r.status === "Running")
  const cancelled = runs.some((r) => r.status === "Cancelled")
  const failedRuns = runs.filter((r) => r.status === "Failed")
  let passed = 0
  let failed = 0
  const failures: { test: string; error: string }[] = []
  for (const r of runs) {
    const results = Array.isArray(r.results) ? (r.results as any[]) : []
    for (const t of results) {
      if (t.status === "passed" || t.status === "flaky") passed++
      else if (t.status !== "skipped") {
        failed++
        failures.push({ test: `${r.script?.name} › ${t.title}`, error: String(t.error?.message ?? t.error ?? "").split("\n")[0].slice(0, 300) })
      }
    }
  }
  const state = active ? "running" : cancelled ? "cancelled" : failedRuns.length ? "failed" : "passed"
  return NextResponse.json({ ref, state, runs: runs.length, passed, failed, total: passed + failed, failures: failures.slice(0, 50) })
}
