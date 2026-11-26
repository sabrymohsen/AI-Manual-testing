import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { OPEN_BUG_STATUSES } from "@/lib/test-cases/rollup"

/**
 * GET /api/projects/:projectId/dashboard/metrics
 *
 * Every number on the Dashboard's test and bug cards, counted in SQL.
 *
 * Test results come from TestCase.lastStatus, the rollup that every run path
 * keeps up to date (automated runs, manual runs from Test Cases, Automation
 * Hub runs of linked scripts). The dashboard used to rebuild this in the
 * browser from the last 50 automated runs only, so manual results never
 * showed, and its pass rate read a field that does not exist (always 0%).
 */

const PASSED_STEP = ["Passed", "SelfHealed"] as const

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }
  const projectId = params.projectId
  const settledAuto = ["Passed", "Failed", "Blocked", "Warning"] as const

  const [
    byStatus,
    byType,
    autoTotal,
    autoPassed,
    autoFailed,
    manualTotal,
    manualPassed,
    manualFailed,
    hubTotal,
    hubPassed,
    hubFailed,
    bugsByStatus,
  ] = await Promise.all([
    prisma.testCase.groupBy({ by: ["lastStatus"], where: { projectId }, _count: { _all: true } }),
    prisma.testCase.groupBy({ by: ["executionType"], where: { projectId }, _count: { _all: true } }),
    prisma.testRun.count({ where: { projectId, completedAt: { not: null }, status: { in: [...settledAuto] } } }),
    prisma.testRun.count({ where: { projectId, completedAt: { not: null }, status: "Passed" } }),
    prisma.testRun.count({ where: { projectId, completedAt: { not: null }, status: "Failed" } }),
    prisma.manualSessionCase.count({ where: { session: { projectId }, completedAt: { not: null }, status: { notIn: ["Pending", "Running"] } } }),
    prisma.manualSessionCase.count({ where: { session: { projectId }, completedAt: { not: null }, status: { in: [...PASSED_STEP] } } }),
    prisma.manualSessionCase.count({ where: { session: { projectId }, completedAt: { not: null }, status: "Failed" } }),
    prisma.testExecution.count({ where: { projectId, status: { in: ["Passed", "Failed"] } } }),
    prisma.testExecution.count({ where: { projectId, status: "Passed" } }),
    prisma.testExecution.count({ where: { projectId, status: "Failed" } }),
    prisma.bugReport.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
  ])

  const status: Record<string, number> = {}
  for (const row of byStatus) status[row.lastStatus] = row._count._all
  const type: Record<string, number> = {}
  for (const row of byType) type[row.executionType] = row._count._all
  const total = Object.values(status).reduce((a, b) => a + b, 0)

  // Pass rate over cases that have a verdict. Skipped is not a verdict.
  const passed = status.Passed ?? 0
  const judged = total - (status.NotExecuted ?? 0) - (status.Skipped ?? 0)
  const passRate = judged > 0 ? Math.round((passed / judged) * 100) : null

  const bugs: Record<string, number> = {}
  for (const row of bugsByStatus) bugs[row.status] = row._count._all
  const sum = (keys: readonly string[]) => keys.reduce((a, k) => a + (bugs[k] ?? 0), 0)

  return NextResponse.json({
    testCases: {
      total,
      manual: type.Manual ?? 0,
      automated: type.Automated ?? 0,
      byStatus: status,
      executed: total - (status.NotExecuted ?? 0),
      passRate,
    },
    runs: {
      total: autoTotal + manualTotal + hubTotal,
      passed: autoPassed + manualPassed + hubPassed,
      failed: autoFailed + manualFailed + hubFailed,
    },
    bugs: {
      total: Object.values(bugs).reduce((a, b) => a + b, 0),
      open: sum(OPEN_BUG_STATUSES),
      resolved: bugs.Resolved ?? 0,
      closed: sum(["Closed", "Rejected", "Duplicate"]),
    },
  })
}
