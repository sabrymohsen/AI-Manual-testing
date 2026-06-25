import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

/**
 * GET /api/projects/[projectId]/test-cases/history
 *
 * Returns a map of testCaseId → { lastStatus, lastRunAt, source }
 * combining both automated TestRun results and ManualSessionCase results.
 * Whichever is more recent wins.
 */
export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  // Fetch latest automated run per test case
  const latestAutomatedRuns = await prisma.testRun.findMany({
    where: {
      projectId: params.projectId,
      testCaseId: { not: null },
      status: { notIn: ["Queued", "Running"] },
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: {
      testCaseId: true,
      status: true,
      completedAt: true,
      id: true,
    },
  })

  // Fetch latest manual session case per test case
  const latestManualCases = await prisma.manualSessionCase.findMany({
    where: {
      testCase: { projectId: params.projectId },
      status: { notIn: ["Pending"] },
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: {
      testCaseId: true,
      status: true,
      completedAt: true,
      id: true,
      session: { select: { id: true, name: true } },
    },
  })

  // Build map: testCaseId → best result
  const map: Record<string, {
    lastStatus: string
    lastRunAt: string
    source: "automated" | "manual"
    runId: string
    sessionName?: string
  }> = {}

  // Process automated runs (deduped — keep latest per testCaseId)
  for (const run of latestAutomatedRuns) {
    if (!run.testCaseId || !run.completedAt) continue
    const existing = map[run.testCaseId]
    if (!existing || new Date(run.completedAt) > new Date(existing.lastRunAt)) {
      map[run.testCaseId] = {
        lastStatus: run.status,
        lastRunAt: run.completedAt.toISOString(),
        source: "automated",
        runId: run.id,
      }
    }
  }

  // Process manual cases — overwrites automated if more recent
  for (const mc of latestManualCases) {
    if (!mc.completedAt) continue
    const existing = map[mc.testCaseId]
    if (!existing || new Date(mc.completedAt) > new Date(existing.lastRunAt)) {
      map[mc.testCaseId] = {
        lastStatus: mc.status,
        lastRunAt: mc.completedAt.toISOString(),
        source: "manual",
        runId: mc.id,
        sessionName: mc.session?.name,
      }
    }
  }

  return NextResponse.json({ history: map })
}
