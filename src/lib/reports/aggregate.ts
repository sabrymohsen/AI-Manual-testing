/**
 * Report aggregation — builds the org-wide and per-project report datasets from
 * Prisma. Mirrors the metric derivations used across the app (pass rate from
 * terminal TestRun outcomes, open-defect counts, coverage from TestCase↔
 * Requirement links) but server-side and in one pass, capped by a date range.
 */
import { prisma } from "@/lib/db"
import type {
  CountBucket,
  OrgReport,
  ProjectReport,
  TrendPoint,
} from "./types"

const DAY = 24 * 60 * 60 * 1000
const TERMINAL = ["Passed", "Failed", "Blocked", "Warning"]
const MANUAL_SOURCES = new Set(["Manual", "Exploratory"])
const OPEN_BUG_STATUSES = ["Open", "InProgress", "ReadyForRetest", "Reopened"]

export function resolveRange(from?: string | null, to?: string | null): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date()
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * DAY)
  return { from: fromDate, to: toDate }
}

function passRate(passed: number, failed: number, blocked: number): number {
  const denom = passed + failed + blocked
  return denom === 0 ? 0 : Math.round((passed / denom) * 100)
}

/** Bucket runs into a daily pass-rate trend. */
function buildTrend(runs: Array<{ status: string; createdAt: Date }>): TrendPoint[] {
  const byDay = new Map<string, { passed: number; failed: number; total: number }>()
  for (const r of runs) {
    if (!TERMINAL.includes(r.status)) continue
    const day = r.createdAt.toISOString().slice(0, 10)
    const b = byDay.get(day) || { passed: 0, failed: 0, total: 0 }
    if (r.status === "Passed") b.passed++
    else b.failed++ // Failed/Blocked/Warning all count against pass rate
    b.total++
    byDay.set(day, b)
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({
      date,
      passed: b.passed,
      failed: b.failed,
      total: b.total,
      passRate: b.total === 0 ? 0 : Math.round((b.passed / b.total) * 100),
    }))
}

function countBy<T>(items: T[], key: (t: T) => string): CountBucket[] {
  const m = new Map<string, number>()
  for (const it of items) {
    const k = key(it)
    m.set(k, (m.get(k) || 0) + 1)
  }
  return Array.from(m.entries()).map(([label, value]) => ({ label, value }))
}

// ─── Org (cross-project) report ────────────────────────────────────────────────

export async function getOrgReport(userId: string, from?: string | null, to?: string | null): Promise<OrgReport> {
  const range = resolveRange(from, to)
  const projects = await prisma.project.findMany({
    where: { userId },
    select: { id: true, name: true, environment: true },
    orderBy: { createdAt: "asc" },
  })
  const projectIds = projects.map((p) => p.id)
  const inRange = { gte: range.from, lte: range.to }

  const [testCaseCounts, runs, bugs] = await Promise.all([
    prisma.testCase.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds } }, _count: { _all: true } }),
    prisma.testRun.findMany({
      where: { projectId: { in: projectIds }, createdAt: inRange },
      select: { projectId: true, status: true, createdAt: true },
    }),
    prisma.bugReport.findMany({
      where: { projectId: { in: projectIds }, createdAt: inRange },
      select: { projectId: true, severity: true, status: true, bugKey: true, title: true },
    }),
  ])

  const tcByProject = new Map(testCaseCounts.map((t) => [t.projectId, t._count._all]))
  const projectName = new Map(projects.map((p) => [p.id, p.name]))

  const projectRows = projects.map((p) => {
    const pruns = runs.filter((r) => r.projectId === p.id)
    const passed = pruns.filter((r) => r.status === "Passed").length
    const failed = pruns.filter((r) => r.status === "Failed").length
    const blocked = pruns.filter((r) => r.status === "Blocked" || r.status === "Warning").length
    const pbugs = bugs.filter((b) => b.projectId === p.id)
    return {
      projectId: p.id,
      name: p.name,
      environment: String(p.environment),
      testCases: tcByProject.get(p.id) || 0,
      runs: pruns.length,
      passRate: passRate(passed, failed, blocked),
      openDefects: pbugs.filter((b) => OPEN_BUG_STATUSES.includes(b.status)).length,
      totalDefects: pbugs.length,
    }
  })

  const totalPassed = runs.filter((r) => r.status === "Passed").length
  const totalFailed = runs.filter((r) => r.status === "Failed").length
  const totalBlocked = runs.filter((r) => r.status === "Blocked" || r.status === "Warning").length

  return {
    scope: "org",
    generatedAt: new Date().toISOString(),
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      projects: projects.length,
      testCases: Array.from(tcByProject.values()).reduce((a, b) => a + b, 0),
      runs: runs.length,
      passRate: passRate(totalPassed, totalFailed, totalBlocked),
      openDefects: bugs.filter((b) => OPEN_BUG_STATUSES.includes(b.status)).length,
      totalDefects: bugs.length,
    },
    projects: projectRows,
    passRateTrend: buildTrend(runs),
    defectsBySeverity: countBy(bugs, (b) => String(b.severity)),
    defectsByStatus: countBy(bugs, (b) => String(b.status)),
    defectsByProject: projectRows.map((r) => ({ label: r.name, value: r.totalDefects })),
    topRisks: bugs
      .filter((b) => OPEN_BUG_STATUSES.includes(b.status) && (b.severity === "Critical" || b.severity === "High"))
      .sort((a, b) => (a.severity === "Critical" ? -1 : 1) - (b.severity === "Critical" ? -1 : 1))
      .slice(0, 15)
      .map((b) => ({
        bugKey: b.bugKey || "—",
        title: b.title,
        severity: String(b.severity),
        status: String(b.status),
        project: projectName.get(b.projectId || "") || "—",
      })),
  }
}

// ─── Per-project report ─────────────────────────────────────────────────────────

export async function getProjectReport(projectId: string, from?: string | null, to?: string | null): Promise<ProjectReport> {
  const range = resolveRange(from, to)
  const inRange = { gte: range.from, lte: range.to }

  const [project, testCases, runs, bugs, requirements, healing] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, environment: true } }),
    prisma.testCase.findMany({
      where: { projectId },
      select: { id: true, title: true, source: true, requirements: { select: { requirementId: true } } },
    }),
    prisma.testRun.findMany({
      where: { projectId, createdAt: inRange },
      select: { status: true, createdAt: true, durationMs: true, testCaseId: true },
    }),
    prisma.bugReport.findMany({
      where: { projectId, createdAt: inRange },
      select: { severity: true, status: true, source: true },
    }),
    prisma.requirement.findMany({
      where: { projectId },
      select: { requirementKey: true, title: true, status: true, testCases: { select: { testCaseId: true } } },
    }),
    // HealingEvent is global (no projectId) — best-effort org-wide signal in range.
    prisma.healingEvent.findMany({ where: { createdAt: inRange }, select: { status: true } }).catch(() => []),
  ])

  if (!project) throw new Error("Project not found")

  const automated = testCases.filter((t) => !MANUAL_SOURCES.has(String(t.source))).length
  const manual = testCases.length - automated

  const passed = runs.filter((r) => r.status === "Passed").length
  const failed = runs.filter((r) => r.status === "Failed").length
  const blocked = runs.filter((r) => r.status === "Blocked" || r.status === "Warning").length
  const executed = runs.filter((r) => TERMINAL.includes(r.status)).length

  // Flakiness: test cases whose terminal runs in range have mixed outcomes.
  const outcomesByCase = new Map<string, Set<string>>()
  const runsByCase = new Map<string, number>()
  for (const r of runs) {
    if (!r.testCaseId || !TERMINAL.includes(r.status)) continue
    const set = outcomesByCase.get(r.testCaseId) || new Set<string>()
    set.add(r.status === "Passed" ? "pass" : "fail")
    outcomesByCase.set(r.testCaseId, set)
    runsByCase.set(r.testCaseId, (runsByCase.get(r.testCaseId) || 0) + 1)
  }
  const flakyCount = Array.from(outcomesByCase.values()).filter((s) => s.size > 1).length

  // Failed tests: cases whose most recent terminal run failed.
  const latestByCase = new Map<string, { status: string; at: Date }>()
  for (const r of runs) {
    if (!r.testCaseId || !TERMINAL.includes(r.status)) continue
    const cur = latestByCase.get(r.testCaseId)
    if (!cur || r.createdAt > cur.at) latestByCase.set(r.testCaseId, { status: r.status, at: r.createdAt })
  }
  const titleByCase = new Map(testCases.map((t) => [t.id, t.title]))
  const failedTests = Array.from(latestByCase.entries())
    .filter(([, v]) => v.status !== "Passed")
    .slice(0, 25)
    .map(([id, v]) => ({ title: titleByCase.get(id) || id, lastStatus: v.status, runs: runsByCase.get(id) || 0 }))

  const reqCovered = requirements.filter((r) => r.testCases.length > 0).length
  const avgDuration = runs.length ? Math.round(runs.reduce((a, r) => a + (r.durationMs || 0), 0) / runs.length) : 0

  return {
    scope: "project",
    generatedAt: new Date().toISOString(),
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    project: { id: project.id, name: project.name, environment: String(project.environment) },
    summary: {
      testCases: testCases.length,
      automated,
      manual,
      runs: runs.length,
      passRate: passRate(passed, failed, blocked),
      openDefects: bugs.filter((b) => OPEN_BUG_STATUSES.includes(b.status)).length,
      totalDefects: bugs.length,
      requirements: requirements.length,
    },
    executionTrend: buildTrend(runs),
    runStatus: countBy(runs, (r) => String(r.status)),
    coverage: {
      requirementsTotal: requirements.length,
      requirementsCovered: reqCovered,
      requirementsUncovered: requirements.length - reqCovered,
      automated,
      manual,
    },
    defectsBySeverity: countBy(bugs, (b) => String(b.severity)),
    defectsByStatus: countBy(bugs, (b) => String(b.status)),
    defectsByComponent: countBy(bugs, (b) => b.source || "Unspecified"),
    automation: {
      healingEvents: healing.length,
      healingSuccess: healing.filter((h: any) => h.status === "recovered").length,
      avgRunDurationMs: avgDuration,
      flakyCount,
    },
    funnel: { total: testCases.length, executed, passed },
    defectLifecycle: {
      open: bugs.filter((b) => b.status === "Open" || b.status === "Reopened").length,
      inProgress: bugs.filter((b) => b.status === "InProgress" || b.status === "ReadyForRetest").length,
      fixed: bugs.filter((b) => b.status === "Resolved").length,
      closed: bugs.filter((b) => b.status === "Closed").length,
    },
    failedTests,
    requirementsTraceability: requirements.slice(0, 50).map((r) => ({
      key: r.requirementKey,
      title: r.title,
      status: String(r.status),
      linkedCases: r.testCases.length,
    })),
  }
}
