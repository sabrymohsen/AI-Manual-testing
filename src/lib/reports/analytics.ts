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
import { DONE_TASK_STATUSES, IN_FLIGHT_TASK_STATUSES, doneAt, startedAt, statusAt, statusMoves } from "@/lib/scrum/history"

const DAY = 24 * 60 * 60 * 1000
const TERMINAL = ["Passed", "Failed", "Blocked", "Warning"]
const OPEN_BUG_STATUSES = ["Open", "InProgress", "ReadyForRetest", "Reopened"]
const RESOLVED_BUG_STATUSES = ["Resolved", "Closed"]

// Requirement coverage status that counts as fully covered (requirements table).
const DONE_STATUSES = ["Covered"]
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


// Scrum Board data (ScrumSprint / Task). The reports used to read the old
// Requirement board's Sprint table, which the Scrum Board never writes to, so
// burndown, velocity and the sprint tables were empty for every team using it.
const SPRINT_TASK_TYPES = { notIn: ["SUBTASK", "EPIC"] as any }
const taskHistorySelect = {
  id: true,
  status: true,
  storyPoints: true,
  createdAt: true,
  updatedAt: true,
  activities: { where: { action: "moved" }, select: { action: true, details: true, createdAt: true } },
} as const

async function findScrumSprint(projectId: string, sprintId?: string | null) {
  if (sprintId) return prisma.scrumSprint.findFirst({ where: { id: sprintId, projectId } })
  return (
    (await prisma.scrumSprint.findFirst({ where: { projectId, status: "ACTIVE" }, orderBy: { startDate: "desc" } })) ??
    (await prisma.scrumSprint.findFirst({ where: { projectId, status: "COMPLETED" }, orderBy: { endDate: "desc" } })) ??
    (await prisma.scrumSprint.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }))
  )
}

/** Story points, or 1 per issue when the sprint has no estimates at all. */
function weigher(tasks: { storyPoints: number | null }[]) {
  const usePoints = tasks.some((t) => (t.storyPoints || 0) > 0)
  return { unit: (usePoints ? "points" : "issues") as "points" | "issues", w: (t: { storyPoints: number | null }) => (usePoints ? t.storyPoints || 0 : 1) }
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
  /** "issues" when no task in the sprint has story points: counts issues instead. */
  unit?: "points" | "issues"
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
  const sprint = await findScrumSprint(projectId, sprintId)
  if (!sprint) return { sprint: null, totalPoints: 0, points: [] }

  const tasks = await prisma.task.findMany({
    where: { sprintId: sprint.id, type: SPRINT_TASK_TYPES },
    select: taskHistorySelect,
  })
  const { unit, w } = weigher(tasks)
  const totalPoints = tasks.reduce((a, t) => a + w(t), 0)
  const finished = tasks.map((t) => ({ t, at: doneAt(t) }))

  const start = sprint.startDate ?? sprint.createdAt
  const end = sprint.endDate ?? new Date(start.getTime() + 13 * DAY)
  const days = eachDay(start, end)
  const n = Math.max(days.length, 1)
  const now = Date.now()

  const points: BurndownPoint[] = days.map((date, i) => {
    const dayEnd = new Date(date).getTime() + DAY - 1
    const completedByDay = finished.filter((f) => f.at !== null && f.at <= dayEnd).reduce((a, f) => a + w(f.t), 0)
    return {
      label: `Day ${i + 1}`,
      date,
      ideal: Math.round(((totalPoints * (n - 1 - i)) / (n - 1 || 1)) * 10) / 10,
      // The actual line stops at today.
      actual: new Date(date).getTime() <= now ? totalPoints - completedByDay : null,
    }
  })

  return {
    sprint: { id: sprint.id, name: sprint.name, startDate: sprint.startDate?.toISOString() ?? null, endDate: sprint.endDate?.toISOString() ?? null },
    totalPoints,
    points,
    unit,
  }
}

// ── Velocity ──────────────────────────────────────────────────────────────

export async function getVelocity(projectId: string): Promise<VelocityResult> {
  const sprints = await prisma.scrumSprint.findMany({
    where: { projectId, status: { in: ["ACTIVE", "COMPLETED"] } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      tasks: { where: { type: SPRINT_TASK_TYPES }, select: { storyPoints: true, status: true } },
    },
  })

  const rows: VelocityRow[] = sprints.map((s) => {
    const committed = s.tasks.reduce((a, t) => a + (t.storyPoints || 0), 0)
    const completed = s.tasks.filter((t) => DONE_TASK_STATUSES.includes(t.status)).reduce((a, t) => a + (t.storyPoints || 0), 0)
    return { sprintId: s.id, name: s.name, committed, completed, capacity: committed }
  })

  // Average over finished sprints only (the last 3): the active sprint is
  // still in progress, and its partial total would understate the team.
  // No finished sprint yet → 0, which means "not known yet".
  const finishedRows = rows.filter((_r, i) => sprints[i].status === "COMPLETED").slice(-3)
  const averageVelocity = finishedRows.length ? Math.round(finishedRows.reduce((a, r) => a + r.completed, 0) / finishedRows.length) : 0
  return { sprints: rows, averageVelocity }
}

// ── Cumulative flow ──────────────────────────────────────────────────────────

export async function getCumulativeFlow(projectId: string, from?: string | null, to?: string | null): Promise<CumulativeFlowPoint[]> {
  const range = resolveRange(from, to)
  const tasks = await prisma.task.findMany({
    where: { projectId, type: SPRINT_TASK_TYPES },
    select: { ...taskHistorySelect, sprintId: true },
  })
  const withMoves = tasks.map((t) => ({ t, moves: statusMoves(t) }))
  const days = eachDay(range.from, range.to)

  return days.map((date) => {
    const dayEnd = new Date(date).getTime() + DAY - 1
    const pt: CumulativeFlowPoint = { date, backlog: 0, todo: 0, inProgress: 0, done: 0 }
    for (const { t, moves } of withMoves) {
      const st = statusAt(t, dayEnd, moves)
      if (!st) continue // not created yet
      if (DONE_TASK_STATUSES.includes(st)) pt.done += 1
      else if (IN_FLIGHT_TASK_STATUSES.includes(st)) pt.inProgress += 1
      else if (t.sprintId) pt.todo += 1
      else pt.backlog += 1
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
    prisma.task.findMany({
      where: { projectId, status: { in: DONE_TASK_STATUSES as any } },
      select: { storyPoints: true, status: true, assignees: { select: { name: true, email: true } } },
    }),
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
    for (const a of r.assignees) {
      const name = norm(a.name || a.email)
      if (!name) continue
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
      select: {
        id: true, title: true, priority: true, source: true, executionType: true, assignee: true, tags: true, updatedAt: true,
        lastStatus: true, lastRunAt: true, lastRunId: true,
      },
    }),
  ])

  // Status comes from the test case rollup (manual sessions and automated runs
  // alike), the same source the Test Cases page uses. Reading only TestRun
  // missed manual results and showed failed cases as "Pending".
  const runIds = testCases.map((t) => t.lastRunId).filter((x): x is string => !!x)
  const runs = runIds.length
    ? await prisma.testRun.findMany({ where: { id: { in: runIds } }, select: { id: true, durationMs: true } })
    : []
  const durationById = new Map(runs.map((r) => [r.id, r.durationMs]))

  // The assignee field holds a user id, a team-member id or a free-text name.
  const assigneeIds = Array.from(new Set(testCases.map((t) => t.assignee).filter((x): x is string => !!x)))
  const [teamMembers, users] = assigneeIds.length
    ? await Promise.all([
        prisma.projectTeamMember.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } }),
        prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true, email: true } }),
      ])
    : [[], []]
  const nameById = new Map<string, string>()
  for (const m of teamMembers) nameById.set(m.id, m.name)
  for (const u of users) nameById.set(u.id, u.name || u.email)

  const STATUS_LABEL: Record<string, string> = { NotExecuted: "Not run" }
  const rows = testCases.map((t) => ({
    id: t.id,
    title: t.title,
    status: STATUS_LABEL[String(t.lastStatus)] ?? String(t.lastStatus),
    assignee: t.assignee ? nameById.get(t.assignee) ?? t.assignee : null,
    priority: String(t.priority),
    executionType: String(t.executionType),
    lastRun: t.lastRunAt?.toISOString() ?? null,
    durationMs: (t.lastRunId && durationById.get(t.lastRunId)) || 0,
    tags: t.tags,
  }))

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
  const sprints = await prisma.scrumSprint.findMany({
    where: { projectId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      tasks: { where: { type: SPRINT_TASK_TYPES }, select: { storyPoints: true, status: true } },
    },
  })

  const label: Record<string, string> = { PLANNED: "Planned", ACTIVE: "Active", COMPLETED: "Completed" }
  const rows = sprints.map((s) => {
    const committed = s.tasks.reduce((a, t) => a + (t.storyPoints || 0), 0)
    const completed = s.tasks.filter((t) => DONE_TASK_STATUSES.includes(t.status)).reduce((a, t) => a + (t.storyPoints || 0), 0)
    return {
      id: s.id,
      name: s.name,
      status: label[s.status] || String(s.status),
      startDate: s.startDate?.toISOString() ?? null,
      endDate: s.endDate?.toISOString() ?? null,
      committed,
      completed,
      velocity: completed,
      progress: committed ? Math.round((completed / committed) * 100) : 0,
    }
  })
  return { rows, totalCount: rows.length, page: 1, limit: rows.length }
}

/** Sprint options for the header dropdown. */
export async function listSprintOptions(projectId: string) {
  const sprints = await prisma.scrumSprint.findMany({
    where: { projectId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  })
  const label: Record<string, string> = { PLANNED: "Planned", ACTIVE: "Active", COMPLETED: "Completed" }
  return sprints.map((s) => ({
    id: s.id,
    name: s.name,
    status: label[s.status] || String(s.status),
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
  }))
}

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
  const tasks = await prisma.task.findMany({ where: { projectId }, select: taskHistorySelect })
  const rows = tasks.map((t) => ({ created: t.createdAt.getTime(), done: doneAt(t) }))
  const days = eachDay(range.from, range.to)

  return days.map((date) => {
    const dayStart = new Date(date).getTime()
    const dayEnd = dayStart + DAY - 1
    const created = rows.filter((r) => r.created >= dayStart && r.created <= dayEnd).length
    const resolved = rows.filter((r) => r.done !== null && r.done >= dayStart && r.done <= dayEnd).length
    const createdSoFar = rows.filter((r) => r.created <= dayEnd).length
    const resolvedSoFar = rows.filter((r) => r.done !== null && r.done <= dayEnd).length
    return { date, created, resolved, cumulativeOpen: Math.max(0, createdSoFar - resolvedSoFar) }
  })
}

/** Control chart: cycle time (days from creation to DONE) for completed tasks. */
export async function getControlChart(projectId: string, from?: string | null, to?: string | null): Promise<ControlChartPoint[]> {
  const range = resolveRange(from, to)
  const [project, tasks] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { boardKey: true } }),
    prisma.task.findMany({
      where: { projectId, status: { in: DONE_TASK_STATUSES as any } },
      select: { ...taskHistorySelect, taskNumber: true, title: true },
    }),
  ])

  return tasks
    .map((t) => ({ t, done: doneAt(t)! }))
    .filter(({ done }) => done >= range.from.getTime() && done <= range.to.getTime())
    .sort((a, b) => a.done - b.done)
    .map(({ t, done }) => ({
      taskKey: `${project?.boardKey || "TASK"}-${t.taskNumber}`,
      title: t.title,
      // Cycle time: from when work started to done.
      cycleTimeDays: Math.round((Math.max(0, done - startedAt(t)) / DAY) * 10) / 10,
      storyPoints: t.storyPoints,
      completedAt: new Date(done).toISOString(),
    }))
}

/** Average age of open tasks grouped by status. */
export async function getAverageAge(projectId: string): Promise<AverageAgeRow[]> {
  const now = Date.now()
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { notIn: DONE_TASK_STATUSES as any } },
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
