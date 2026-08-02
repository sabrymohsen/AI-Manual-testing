import { prisma } from "@/lib/db"
import type { TestCaseStatus, ExecutionType } from "@prisma/client"

/**
 * Maintains the denormalised execution rollup on TestCase.
 *
 * TestCase.lastStatus / lastRunAt / lastRunId / lastRunSource / openBugCount
 * exist so the test-case list can filter, sort and paginate in SQL. Before
 * these columns, "last status" lived nowhere in Postgres and the browser
 * recomputed it by downloading every TestRun and ManualSessionCase in the
 * project — which is why the page could not paginate at all.
 *
 * There are exactly four write points. If you add a fifth place that settles a
 * run or changes a bug's open/closed state, call into this module from there
 * too, or the list will drift from reality.
 *
 *   1. a TestRun reaches a terminal status        → recalcTestCaseRollup
 *   2. a ManualSessionCase completes              → recalcTestCaseRollup
 *   3. a BugReport is created / closed / reopened → recalcOpenBugCount
 *   4. the backfill script                        → scripts/backfill-test-suites.ts
 *
 * All functions are best-effort: they never throw into the caller's request
 * path. A stale rollup is a cosmetic problem; a failed test run because the
 * rollup write blew up is not.
 */

/** Bug statuses that count as "still open against this case". */
export const OPEN_BUG_STATUSES = ["Open", "InProgress", "ReadyForRetest", "Reopened"] as const

/**
 * TestRunStatus (automated) / StepStatus (manual) → case-level verdict.
 * Returns null for non-terminal states so an in-flight run never overwrites
 * the last settled verdict.
 */
export function toCaseStatus(raw: string | null | undefined): TestCaseStatus | null {
  switch (raw) {
    case "Passed":
      return "Passed"
    case "Failed":
      return "Failed"
    case "Blocked":
      return "Blocked"
    case "Warning":
      return "Warning"
    case "Skipped":
      return "Skipped"
    case "SelfHealed":
      // A self-healed step still satisfied its assertion.
      return "Passed"
    default:
      // Queued / Running / Pending / Cancelled — not a verdict.
      return null
  }
}

/**
 * Recomputes the execution rollup for one test case from its latest settled
 * automated run and latest settled manual result. Whichever finished later
 * wins, so a manual re-test correctly supersedes an older automated failure.
 *
 * Deliberately recomputed from source rather than patched in place: it stays
 * correct even if a run is deleted or backdated, and it makes the function
 * idempotent.
 */
export async function recalcTestCaseRollup(testCaseId: string): Promise<void> {
  try {
    const [auto, manual] = await Promise.all([
      prisma.testRun.findFirst({
        where: { testCaseId, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { id: true, status: true, completedAt: true },
      }),
      prisma.manualSessionCase.findFirst({
        where: { testCaseId, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { id: true, status: true, completedAt: true },
      }),
    ])

    let winner: { status: string; at: Date; runId: string; source: ExecutionType } | null = null

    if (auto?.completedAt && manual?.completedAt) {
      winner =
        auto.completedAt >= manual.completedAt
          ? { status: auto.status, at: auto.completedAt, runId: auto.id, source: "Automated" }
          : { status: manual.status, at: manual.completedAt, runId: manual.id, source: "Manual" }
    } else if (auto?.completedAt) {
      winner = { status: auto.status, at: auto.completedAt, runId: auto.id, source: "Automated" }
    } else if (manual?.completedAt) {
      winner = { status: manual.status, at: manual.completedAt, runId: manual.id, source: "Manual" }
    }

    const mapped = winner ? toCaseStatus(winner.status) : null

    await prisma.testCase.update({
      where: { id: testCaseId },
      data: {
        lastStatus: mapped ?? "NotExecuted",
        lastRunAt: mapped && winner ? winner.at : null,
        lastRunId: mapped && winner ? winner.runId : null,
        lastRunSource: mapped && winner ? winner.source : null,
      },
    })
  } catch (err) {
    console.error(`[rollup] failed to recalc test case ${testCaseId}:`, err)
  }
}

/** Recomputes openBugCount for one test case. */
export async function recalcOpenBugCount(testCaseId: string): Promise<void> {
  try {
    const openBugCount = await prisma.bugReport.count({
      where: { testCaseId, status: { in: [...OPEN_BUG_STATUSES] as any } },
    })
    await prisma.testCase.update({ where: { id: testCaseId }, data: { openBugCount } })
  } catch (err) {
    console.error(`[rollup] failed to recount bugs for test case ${testCaseId}:`, err)
  }
}

/**
 * Recalculates from a TestRun id, resolving the case itself.
 *
 * Call sites that finalise a run usually have the run id to hand but not the
 * test case id, so this saves them a lookup and keeps the call a one-liner.
 */
export async function recalcFromTestRun(testRunId: string): Promise<void> {
  try {
    const run = await prisma.testRun.findUnique({
      where: { id: testRunId },
      select: { testCaseId: true },
    })
    if (run?.testCaseId) await recalcTestCaseRollup(run.testCaseId)
  } catch (err) {
    console.error(`[rollup] failed to resolve test case for run ${testRunId}:`, err)
  }
}

/** Recalculates from a ManualSessionCase id. */
export async function recalcFromManualSessionCase(manualSessionCaseId: string): Promise<void> {
  try {
    const msc = await prisma.manualSessionCase.findUnique({
      where: { id: manualSessionCaseId },
      select: { testCaseId: true },
    })
    if (msc?.testCaseId) await recalcTestCaseRollup(msc.testCaseId)
  } catch (err) {
    console.error(`[rollup] failed to resolve test case for manual case ${manualSessionCaseId}:`, err)
  }
}

/** Convenience for bulk runs — recalculates several cases concurrently. */
export async function recalcMany(testCaseIds: (string | null | undefined)[]): Promise<void> {
  const ids = Array.from(new Set(testCaseIds.filter((id): id is string => !!id)))
  await Promise.all(ids.map(recalcTestCaseRollup))
}
