"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import type {
  BurndownResult,
  VelocityResult,
  CumulativeFlowPoint,
  DefectTrendPoint,
  ExecutionFunnelResult,
  TeamMemberPerf,
  Paginated,
  TaskCreatedResolvedPoint,
  ControlChartPoint,
  AverageAgeRow,
} from "@/lib/reports/analytics"
import type { ProjectReport } from "@/lib/reports/types"

export interface DashboardFilters {
  projectId: string
  sprintId?: string | null
  from: string
  to: string
}

export interface TableQuery {
  projectId: string
  search?: string
  page: number
  limit: number
  sort?: string
  order?: "asc" | "desc"
  status?: string
  severity?: string
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

// Auto-refresh is driven centrally from the page (invalidating the "reports"
// key on an interval) so the header toggle can turn it on/off.
const AUTO = { staleTime: 60_000 } as const

function rangeQS(f: DashboardFilters): string {
  const p = new URLSearchParams({ projectId: f.projectId, from: f.from, to: f.to })
  if (f.sprintId) p.set("sprintId", f.sprintId)
  return p.toString()
}

// ── Projects list ──
export interface ProjectOption { id: string; name: string }
export function useProjects() {
  return useQuery({
    queryKey: ["reports", "projects"],
    queryFn: () => getJSON<{ projects: any[] }>("/api/projects").then((d) => (d.projects || []).map((p) => ({ id: p.id, name: p.name })) as ProjectOption[]),
    staleTime: 5 * 60_000,
  })
}

// ── KPI source: existing project report ──
export function useProjectReport(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "project", f.projectId, f.from, f.to],
    queryFn: () => getJSON<{ report: ProjectReport }>(`/api/reports/project/${f.projectId}?from=${f.from}&to=${f.to}`).then((d) => d.report),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

// ── Charts ──
export function useBurndown(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "burndown", f.projectId, f.sprintId],
    queryFn: () => getJSON<{ burndown: BurndownResult }>(`/api/reports/sprint-metrics?${rangeQS(f)}`).then((d) => d.burndown),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useVelocity(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "velocity", f.projectId],
    queryFn: () => getJSON<{ velocity: VelocityResult }>(`/api/reports/sprints?projectId=${f.projectId}&velocity=1`).then((d) => d.velocity),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useCumulativeFlow(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "cfd", f.projectId, f.from, f.to],
    queryFn: () => getJSON<{ flow: CumulativeFlowPoint[] }>(`/api/reports/cumulative-flow?${rangeQS(f)}`).then((d) => d.flow),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useDefectTrend(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "defect-trend", f.projectId, f.from, f.to],
    queryFn: () => getJSON<{ trend: DefectTrendPoint[] }>(`/api/reports/defect-trend?${rangeQS(f)}`).then((d) => d.trend),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useExecutionFunnel(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "funnel", f.projectId, f.sprintId],
    queryFn: () => getJSON<{ funnel: ExecutionFunnelResult }>(`/api/reports/execution-funnel?${rangeQS(f)}`).then((d) => d.funnel),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useTeamPerformance(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "team", f.projectId, f.from, f.to],
    queryFn: () => getJSON<{ members: TeamMemberPerf[] }>(`/api/reports/team-performance?${rangeQS(f)}`).then((d) => d.members),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

// ── Sprint options (header dropdown + table) ──
export interface SprintRow {
  id: string
  name: string
  status: string
  startDate: string | null
  endDate: string | null
  committed: number
  completed: number
  velocity: number
  progress: number
}
export function useSprints(projectId: string) {
  return useQuery({
    queryKey: ["reports", "sprints", projectId],
    queryFn: () => getJSON<Paginated<SprintRow>>(`/api/reports/sprints?projectId=${projectId}`),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

// ── Paginated tables ──
function tableQS(q: TableQuery): string {
  const p = new URLSearchParams({ projectId: q.projectId, page: String(q.page), limit: String(q.limit) })
  if (q.search) p.set("search", q.search)
  if (q.sort) p.set("sort", q.sort)
  if (q.order) p.set("order", q.order)
  if (q.status) p.set("status", q.status)
  if (q.severity) p.set("severity", q.severity)
  return p.toString()
}

function useTable<T>(kind: string, q: TableQuery) {
  return useQuery({
    queryKey: ["reports", "table", kind, q],
    queryFn: () => getJSON<Paginated<T>>(`/api/reports/${kind}?${tableQS(q)}`),
    enabled: !!q.projectId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export const useTestsTable = (q: TableQuery) => useTable<any>("tests", q)
export const useBugsTable = (q: TableQuery) => useTable<any>("bugs", q)
export const useRequirementsTable = (q: TableQuery) => useTable<any>("requirements", q)

// ── Task-level Scrum analytics ──
export function useTaskCreatedResolved(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "task-created-resolved", f.projectId, f.from, f.to],
    queryFn: () => getJSON<{ trend: TaskCreatedResolvedPoint[] }>(`/api/reports/task-created-resolved?${rangeQS(f)}`).then((d) => d.trend),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useControlChart(f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "control-chart", f.projectId, f.from, f.to],
    queryFn: () => getJSON<{ points: ControlChartPoint[] }>(`/api/reports/control-chart?${rangeQS(f)}`).then((d) => d.points),
    enabled: !!f.projectId,
    ...AUTO,
  })
}

export function useAverageAge(projectId: string) {
  return useQuery({
    queryKey: ["reports", "average-age", projectId],
    queryFn: () => getJSON<{ rows: AverageAgeRow[] }>(`/api/reports/average-age?projectId=${projectId}`).then((d) => d.rows),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}
