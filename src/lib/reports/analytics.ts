/**
 * Analytics aggregation for the QA Analytics Dashboard. Every series is derived
 * live from real Prisma data (Requirements act as sprint stories with story
 * points; TestRuns/TestCases/BugReports drive execution + defect metrics). No
 * mock data. Complements — does not replace — the existing `aggregate.ts`.
 *
 * Sprint status history isn't stored, so time-bucketed series (CFD, defect
 * trend, burndown) approximate a row's position from its createdAt (entered the
 * flow) and updatedAt (reached its current state). SprintMetric rows, when a job
 * populates them, can later replace these approximations 1:1.
 */
import { prisma } from "@/lib/db"
import { resolveRange } from "./aggregate"

const DAY = 24 * 60 * 60 * 1000
const TERMINAL = ["Passed", "Failed", "Blocked", "Warning"]
const OPEN_BUG_STATUSES = ["Open", "InProgress", "ReadyForRetest", "Reopened"]
const RESOLVED_BUG_STATUSES = ["Resolved", "Closed"]

// Requirement status → kanban band used by burndown / CFD.
const DONE_STATUSES = ["Covered"]
const IN_PROGRESS_STATUSES = ["InTesting", "PartiallyCovered"]
const TODO_STATUSES = ["ReadyForTesting", "Failed", "Blocked"]
// Draft / Deprecated fall into "backlog".

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Inclusive list of YYYY-MM-DD day keys between two dates (capped at 120). */
function eachDay(from: Date, to: Date): string[] {
  const out: string[] = []
  const start = new Date(ymd(from))
  const end = new Date(ymd(to))
  let cur = start.getTime()
  let guard = 0
  while (cur <= end.getTime() && guard < 120) {
    out.push(ymd(new Date(cur)))
    cur += DAY
    guard++
  }
  return out
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface BurndownPoint {
  label: string
  date: string
  ideal: number
  actual: number | null
}
export interface BurndownResult {
  sprint: { id: string; name: string; startDate: string | null; endDate: string | null } | null
  totalPoints: number
  points: BurndownPoint[]
}

export interface VelocityRow {
  sprintId: string
  name: string
  committed: number
  completed: number
  capacity: number
}
export interface VelocityResult {
  sprints: VelocityRow[]
  averageVelocity: number
}

export interface CumulativeFlowPoint {
  date: string
  backlog: number
  todo: number
  inProgress: number
  done: number
}

export interface DefectTrendPoint {
  date: string
  created: number
  resolved: number
  cumulativeOpen: number
}

export interface ExecutionFunnelResult {
  total: number
  executed: number
  passed: number
  failed: number
  blocked: number
}

export interface TeamMemberPerf {
  name: string
  storyPoints: number
  tasksCompleted: number
  bugsFound: number
  passRate: number
  turnaroundHours: number
  testsWritten: number
}

export interface Paginated<T> {
  rows: T[]
  totalCount: number
  page: number
  limit: number
}

// ── Sprint burndown ─────────────────────────────────────────────────────────

export async function getSprintBurndown(projectId: string, sprintId?: string | null): Promise<BurndownResult> {
  const sprint = sprintId
    ? await prisma.sprint.findFirst({ where: { id: sprintId, projectId } })
    : (await prisma.sprint.findFirst({ where: { projectId, status: "Active" }, orderBy: { startDate: "desc" } })) ??
      (await prisma.sprint.findFirst({ where: { projectId }, orderBy: { startDate: "desc" } }))

  if (!sprint) return { sprint: null, totalPoints: 0, points: [] }

  const reqs = await prisma.requirement.findMany({
    where: { sprintId: sprint.id },
    select: { storyPoints: true, status: true, updatedAt: true },
  })
  const totalPoints = reqs.reduce((a, r) => a + (r.storyPoints || 0), 0)

  const start = sprint.startDate ?? new Date(Date.now() - 13 * DAY)
  const end = sprint.endDate ?? new Date(start.getTime() + 13 * DAY)
  const days = eachDay(start, end)
  const n = Math.max(days.length, 1)
  const now = Date.now()

  const points: BurndownPoint[] = days.map((date, i) => {
    const dayEnd = new Date(date).getTime() + DAY - 1
    // Actual remaining = total − points completed on/before this day. Future days
    // (beyond today) carry a null actual so the line stops at "today".
    const completedByDay = reqs
      .filter((r) => DONE_STATUSES.includes(r.status) && r.updatedAt.getTime() <= dayEnd)
      .reduce((a, r) => a + (r.storyPoints || 0), 0)
    return {
      label: `Day ${i + 1}`,
      date,
      ideal: Math.round((totalPoints * (n - 1 - i)) / (n - 1 || 1)),
      actual: new Date(date).getTime() <= now + DAY ? totalPoints - completedByDay : null,
    }
  })

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate?.toISOString() ?? null,
      endDate: sprint.endDate?.toISOString() ?? null,
    },
    totalPoints,
    points,
  }
}

// ── Velocity ──────────────────────────────────────────────────────────────

export async function getVelocity(projectId: string): Promise<VelocityResult> {
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    orderBy: [{ startDate: "asc" }, { orderIndex: "asc" }],
    select: {
      id: true,
      name: true,
      requirements: { select: { storyPoints: true, status: true } },
      velocities: { select: { capacity: true, velocity: true } },
    },
  })

  const rows: VelocityRow[] = sprints.map((s) => {
    const committed = s.requirements.reduce((a, r) => a + (r.storyPoints || 0), 0)
    const completed = s.requirements
      .filter((r) => DONE_STATUSES.includes(r.status))
      .reduce((a, r) => a + (r.storyPoints || 0), 0)
    const snap = s.velocities[0]
    return {
      sprintId: s.id,
      name: s.name,
      committed,
      completed: snap?.velocity ?? completed,
      capacity: snap?.capacity ?? committed,
    }
  })

  const done = rows.filter((r) => r.completed > 0)
  const averageVelocity = done.length ? Math.round(done.reduce((a, r) => a + r.completed, 0) / done.length) : 0
  return { sprints: rows, averageVelocity }
}

// ── Cumulative flow ──────────────────────────────────────────────────────────

export async function getCumulativeFlow(projectId: string, from?: string | null, to?: string | null): Promise<CumulativeFlowPoint[]> {
  const range = resolveRange(from, to)
  const reqs = await prisma.requirement.findMany({
    where: { projectId },
    select: { status: true, createdAt: true, updatedAt: true },
  })
  const days = eachDay(range.from, range.to)

  const band = (status: string): keyof Omit<CumulativeFlowPoint, "date"> => {
    if (DONE_STATUSES.includes(status)) return "done"
    if (IN_PROGRESS_STATUSES.includes(status)) return "inProgress"
    if (TODO_STATUSES.includes(status)) return "todo"
    return "backlog"
  }

  return days.map((date) => {
    const dayEnd = new Date(date).getTime() + DAY - 1
    const pt: CumulativeFlowPoint = { date, backlog: 0, todo: 0, inProgress: 0, done: 0 }
    for (const r of reqs) {
      if (r.createdAt.getTime() > dayEnd) continue // not created yet
      // Reached its current band only after updatedAt; before that it sat in backlog.
      const reached = r.updatedAt.getTime() <= dayEnd
      const b = reached ? band(r.status) : "backlog"
      pt[b] += 1
    }
    return pt
  })
}

// ── Defect trend ─────────────────────────────────────────────────────────────

export async function getDefectTrend(projectId: string, from?: string | null, to?: string | null): Promise<DefectTrendPoint[]> {
  const range = resolveRange(from, to)
  const bugs = await prisma.bugReport.findMany({
    where: { projectId },
    select: { status: true, createdAt: true, updatedAt: true },
  })
  const days = eachDay(range.from, range.to)

  return days.map((date) => {
    const dayStart = new Date(date).getTime()
    const dayEnd = dayStart + DAY - 1
    const created = bugs.filter((b) => b.createdAt.getTime() >= dayStart && b.createdAt.getTime() <= dayEnd).length
    const resolved = bugs.filter(
      (b) => RESOLVED_BUG_STATUSES.includes(b.status) && b.updatedAt.getTime() >= dayStart && b.updatedAt.getTime() <= dayEnd
    ).length
    const createdSoFar = bugs.filter((b) => b.createdAt.getTime() <= dayEnd).length
    const resolvedSoFar = bugs.filter(
      (b) => RESOLVED_BUG_STATUSES.includes(b.status) && b.updatedAt.getTime() <= dayEnd
    ).length
    return { date, created, resolved, cumulativeOpen: Math.max(0, createdSoFar - resolvedSoFar) }
  })
}

// ── Execution funnel ─────────────────────────────────────────────────────────

export async function getExecutionFunnel(projectId: string): Promise<ExecutionFunnelResult> {
  const [total, runs] = await Promise.all([
    prisma.testCase.count({ where: { projectId } }),
    prisma.testRun.findMany({
      where: { projectId, testCaseId: { not: null }, status: { in: TERMINAL as any } },
      select: { testCaseId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])

  // Latest terminal outcome per test case.
  const latest = new Map<string, string>()
  for (const r of runs) {
    if (r.testCaseId && !latest.has(r.testCaseId)) latest.set(r.testCaseId, r.status)
  }
  const statuses = [...latest.values()]
  return {
    total,
    executed: latest.size,
    passed: statuses.filter((s) => s === "Passed").length,
    failed: statuses.filter((s) => s === "Failed").length,
    blocked: statuses.filter((s) => s === "Blocked" || s === "Warning").length,
  }
}

// ── Team performance ─────────────────────────────────────────────────────────

export async function getTeamPerformance(projectId: string, from?: string | null, to?: string | null): Promise<TeamMemberPerf[]> {
  const range = resolveRange(from, to)
  const inRange = { gte: range.from, lte: range.to }

  const [reqs, testCases, bugs, runs, teamPool] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId }, select: { assignee: true, storyPoints: true, status: true } }),
    prisma.testCase.findMany({ where: { projectId }, select: { id: true, assignee: true } }),
    prisma.bugReport.findMany({
      where: { projectId, createdAt: inRange },
      select: { assignedTo: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.testRun.findMany({
      where: { projectId, createdAt: inRange, testCaseId: { not: null }, status: { in: TERMINAL as any } },
      select: { testCaseId: true, status: true },
    }),
    prisma.projectTeamMember.findMany({ where: { projectId, active: true }, select: { name: true } }),
  ])

  const norm = (s: string | null | undefined) => (s || "").trim()
  const caseAssignee = new Map(testCases.map((t) => [t.id, norm(t.assignee)]))

  type Acc = { storyPoints: number; tasksCompleted: number; bugsFound: number; testsWritten: number; passed: number; executed: number; turnaroundMs: number; resolvedBugs: number }
  const acc = new Map<string, Acc>()
  const get = (name: string): Acc => {
    if (!acc.has(name)) acc.set(name, { storyPoints: 0, tasksCompleted: 0, bugsFound: 0, testsWritten: 0, passed: 0, executed: 0, turnaroundMs: 0, resolvedBugs: 0 })
    return acc.get(name)!
  }

  for (const r of reqs) {
    const name = norm(r.assignee)
    if (!name) continue
    if (DONE_STATUSES.includes(r.status)) {
      get(name).storyPoints += r.storyPoints || 0
      get(name).tasksCompleted += 1
    }
  }
  for (const t of testCases) {
    const name = norm(t.assignee)
    if (name) get(name).testsWritten += 1
  }
  for (const b of bugs) {
    const name = norm(b.assignedTo)
    if (!name) continue
    get(name).bugsFound += 1
    if (RESOLVED_BUG_STATUSES.includes(b.status)) {
      get(name).turnaroundMs += Math.max(0, b.updatedAt.getTime() - b.createdAt.getTime())
      get(name).resolvedBugs += 1
    }
  }
  for (const run of runs) {
    const name = caseAssignee.get(run.testCaseId || "")
    if (!name) continue
    get(name).executed += 1
    if (run.status === "Passed") get(name).passed += 1
  }

  // Seed any team-pool members with no activity so the roster is complete.
  for (const m of teamPool) {
    const name = norm(m.name)
    if (name) get(name)
  }

  const members: TeamMemberPerf[] = [...acc.entries()].map(([name, a]) => ({
    name,
    storyPoints: a.storyPoints,
    tasksCompleted: a.tasksCompleted,
    bugsFound: a.bugsFound,
    passRate: a.executed ? Math.round((a.passed / a.executed) * 100) : 0,
    turnaroundHours: a.resolvedBugs ? Math.round(a.turnaroundMs / a.resolvedBugs / 3_600_000) : 0,
    testsWritten: a.testsWritten,
  }))

  // Most active first; cap at 8 for the radar (component groups the rest).
  return members
    .sort((x, y) => y.storyPoints + y.tasksCompleted + y.testsWritten - (x.storyPoints + x.tasksCompleted + x.testsWritten))
    .slice(0, 8)
}

// ── Paginated tables ─────────────────────────────────────────────────────────

export interface ListParams {
  projectId: string
  search?: string
  page: number
  limit: number
  sort?: string
  order?: "asc" | "desc"
  status?: string
  severity?: string
}

export async function listTests(p: ListParams): Promise<Paginated<any>> {
  const where: any = { projectId: p.projectId }
  if (p.search) where.title = { contains: p.search, mode: "insensitive" }
  if (p.status && p.status !== "all") where.priority = p.status // reused as priority filter when provided

  const sortField = ["title", "priority", "createdAt", "updatedAt"].includes(p.sort || "") ? p.sort! : "updatedAt"
  const [total, testCases] = await Promise.all([
    prisma.testCase.count({ where }),
    prisma.testCase.findMany({
      where,
      orderBy: { [sortField]: p.order ?? "desc" },
      skip: (p.page - 1) * p.limit,
      take: p.limit,
      select: { id: true, title: true, priority: true, source: true, executionType: true, assignee: true, tags: true, updatedAt: true },
    }),
  ])

  // Latest terminal run per test case (page-scoped for performance).
  const ids = testCases.map((t) => t.id)
  const runs = ids.length
    ? await prisma.testRun.findMany({
        where: { testCaseId: { in: ids }, status: { in: TERMINAL as any } },
        select: { testCaseId: true, status: true, durationMs: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : []
  const latest = new Map<string, { status: string; durationMs: number; at: Date }>()
  for (const r of runs) {
    if (r.testCaseId && !latest.has(r.testCaseId)) latest.set(r.testCaseId, { status: r.status, durationMs: r.durationMs, at: r.createdAt })
  }

  const rows = testCases.map((t) => {
    const run = latest.get(t.id)
    return {
      id: t.id,
      title: t.title,
      status: run?.status ?? "Pending",
      assignee: t.assignee ?? null,
      priority: String(t.priority),
      executionType: String(t.executionType),
      lastRun: run?.at.toISOString() ?? null,
      durationMs: run?.durationMs ?? 0,
      tags: t.tags,
    }
  })

  return { rows, totalCount: total, page: p.page, limit: p.limit }
}

export async function listBugs(p: ListParams): Promise<Paginated<any>> {
  const where: any = { projectId: p.projectId }
  if (p.search) where.OR = [{ title: { contains: p.search, mode: "insensitive" } }, { bugKey: { contains: p.search, mode: "insensitive" } }]
  if (p.severity && p.severity !== "all") where.severity = p.severity
  if (p.status && p.status !== "all") where.status = p.status

  const sortField = ["createdAt", "updatedAt", "severity", "status", "title"].includes(p.sort || "") ? p.sort! : "createdAt"
  const [total, bugs] = await Promise.all([
    prisma.bugReport.count({ where }),
    prisma.bugReport.findMany({
      where,
      orderBy: { [sortField]: p.order ?? "desc" },
      skip: (p.page - 1) * p.limit,
      take: p.limit,
      select: { id: true, bugKey: true, title: true, severity: true, status: true, assignedTo: true, source: true, createdAt: true },
    }),
  ])

  const rows = bugs.map((b) => ({
    id: b.id,
    key: b.bugKey ?? "—",
    title: b.title,
    severity: String(b.severity),
    status: String(b.status),
    assignee: b.assignedTo ?? null,
    component: b.source ?? "—",
    created: b.createdAt.toISOString(),
  }))
  return { rows, totalCount: total, page: p.page, limit: p.limit }
}

export async function listRequirements(p: ListParams): Promise<Paginated<any>> {
  const where: any = { projectId: p.projectId }
  if (p.search) where.OR = [{ title: { contains: p.search, mode: "insensitive" } }, { requirementKey: { contains: p.search, mode: "insensitive" } }]
  if (p.status && p.status !== "all") where.status = p.status

  const sortField = ["createdAt", "updatedAt", "requirementKey", "title", "status"].includes(p.sort || "") ? p.sort! : "createdAt"
  const [total, reqs] = await Promise.all([
    prisma.requirement.count({ where }),
    prisma.requirement.findMany({
      where,
      orderBy: { [sortField]: p.order ?? "desc" },
      skip: (p.page - 1) * p.limit,
      take: p.limit,
      select: {
        id: true,
        requirementKey: true,
        title: true,
        status: true,
        updatedAt: true,
        testCases: { select: { testCaseId: true } },
      },
    }),
  ])

  const coverageFor = (status: string) =>
    DONE_STATUSES.includes(status) ? 100 : status === "PartiallyCovered" ? 50 : status === "InTesting" ? 25 : 0

  const rows = reqs.map((r) => ({
    id: r.id,
    key: r.requirementKey,
    title: r.title,
    status: String(r.status),
    coverage: coverageFor(r.status),
    linkedTests: r.testCases.length,
    lastTested: r.updatedAt.toISOString(),
  }))
  return { rows, totalCount: total, page: p.page, limit: p.limit }
}

export async function listSprints(projectId: string): Promise<Paginated<any>> {
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    orderBy: [{ startDate: "desc" }, { orderIndex: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      requirements: { select: { storyPoints: true, status: true } },
      velocities: { select: { velocity: true } },
    },
  })

  const rows = sprints.map((s) => {
    const committed = s.requirements.reduce((a, r) => a + (r.storyPoints || 0), 0)
    const completed = s.requirements
      .filter((r) => DONE_STATUSES.includes(r.status))
      .reduce((a, r) => a + (r.storyPoints || 0), 0)
    return {
      id: s.id,
      name: s.name,
      status: String(s.status),
      startDate: s.startDate?.toISOString() ?? null,
      endDate: s.endDate?.toISOString() ?? null,
      committed,
      completed,
      velocity: s.velocities[0]?.velocity ?? completed,
      progress: committed ? Math.round((completed / committed) * 100) : 0,
    }
  })
  return { rows, totalCount: rows.length, page: 1, limit: rows.length }
}

/** Sprint options for the header dropdown. */
export async function listSprintOptions(projectId: string) {
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    orderBy: [{ startDate: "desc" }, { orderIndex: "asc" }],
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  })
  return sprints.map((s) => ({
    id: s.id,
    name: s.name,
    status: String(s.status),
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
//  TASK-LEVEL ANALYTICS (Scrum board Task model)
// ═══════════════════════════════════════════════════════════════════════════

export interface TaskCreatedResolvedPoint {
  date: string
  created: number
  resolved: number
  cumulativeOpen: number
}

export interface ControlChartPoint {
  taskKey: string
  title: string
  cycleTimeDays: number
  storyPoints: number | null
  completedAt: string
}

export interface AverageAgeRow {
  status: string
  count: number
  averageAgeDays: number
  oldestDays: number
}

/** Tasks created vs resolved (status=DONE) over a date range. */
export async function getTaskCreatedResolved(projectId: string, from?: string | null, to?: string | null): Promise<TaskCreatedResolvedPoint[]> {
  const range = resolveRange(from, to)
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { status: true, createdAt: true, updatedAt: true },
  })
  const days = eachDay(range.from, range.to)

  return days.map((date) => {
    const dayStart = new Date(date).getTime()
    const dayEnd = dayStart + DAY - 1
    const created = tasks.filter((t) => t.createdAt.getTime() >= dayStart && t.createdAt.getTime() <= dayEnd).length
    const resolved = tasks.filter((t) => t.status === "DONE" && t.updatedAt.getTime() >= dayStart && t.updatedAt.getTime() <= dayEnd).length
    const createdSoFar = tasks.filter((t) => t.createdAt.getTime() <= dayEnd).length
    const resolvedSoFar = tasks.filter((t) => t.status === "DONE" && t.updatedAt.getTime() <= dayEnd).length
    return { date, created, resolved, cumulativeOpen: Math.max(0, createdSoFar - resolvedSoFar) }
  })
}

/** Control chart: cycle time (days from creation to DONE) for completed tasks. */
export async function getControlChart(projectId: string, from?: string | null, to?: string | null): Promise<ControlChartPoint[]> {
  const range = resolveRange(from, to)
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      status: "DONE",
      updatedAt: { gte: range.from, lte: range.to },
    },
    select: { taskNumber: true, title: true, storyPoints: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  })

  return tasks.map((t) => {
    const cycleTimeMs = Math.max(0, t.updatedAt.getTime() - t.createdAt.getTime())
    return {
      taskKey: `TASK-${t.taskNumber}`,
      title: t.title,
      cycleTimeDays: Math.round((cycleTimeMs / DAY) * 10) / 10,
      storyPoints: t.storyPoints,
      completedAt: t.updatedAt.toISOString(),
    }
  })
}

/** Average age of open tasks grouped by status. */
export async function getAverageAge(projectId: string): Promise<AverageAgeRow[]> {
  const now = Date.now()
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { not: "DONE" } },
    select: { status: true, createdAt: true },
  })

  const groups = new Map<string, number[]>()
  for (const t of tasks) {
    const ageDays = Math.floor((now - t.createdAt.getTime()) / DAY)
    if (!groups.has(t.status)) groups.set(t.status, [])
    groups.get(t.status)!.push(ageDays)
  }

  const statusOrder = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING", "DEPLOYED"]
  const rows: AverageAgeRow[] = []
  for (const [status, ages] of groups) {
    const avg = ages.reduce((a, b) => a + b, 0) / ages.length
    rows.push({
      status,
      count: ages.length,
      averageAgeDays: Math.round(avg * 10) / 10,
      oldestDays: Math.max(...ages),
    })
  }
  rows.sort((a, b) => {
    const ia = statusOrder.indexOf(a.status)
    const ib = statusOrder.indexOf(b.status)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return rows
}
