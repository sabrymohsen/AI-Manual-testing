"use client"

import { BarChart3, RefreshCw, Settings } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { ProjectOption, SprintRow } from "@/hooks/reports/use-analytics"

export type DashboardRole = "PM" | "QA Manager" | "Test Lead" | "Developer"
export const DASHBOARD_ROLES: DashboardRole[] = ["PM", "QA Manager", "Test Lead", "Developer"]

export type DatePreset = "7D" | "30D" | "90D" | "YTD" | "Custom"
export const DATE_PRESETS: DatePreset[] = ["7D", "30D", "90D", "YTD", "Custom"]

const selectCls = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"

export function DashboardHeader(props: {
  projects: ProjectOption[]
  projectId: string
  onProject: (id: string) => void
  sprints: SprintRow[]
  sprintId: string | undefined
  onSprint: (id: string | undefined) => void
  preset: DatePreset
  onPreset: (p: DatePreset) => void
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  role: DashboardRole
  onRole: (r: DashboardRole) => void
  onRefresh: () => void
  isFetching: boolean
  lastUpdated: Date | null
  autoRefresh: boolean
  onToggleAutoRefresh: () => void
  exportSlot: React.ReactNode
}) {
  const stale = props.lastUpdated ? Date.now() - props.lastUpdated.getTime() > 5 * 60_000 : false

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-none text-slate-900">Reports</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">Analytics &amp; insights</p>
          </div>
        </div>

        <div className="ml-2 flex flex-wrap items-center gap-2">
          <select className={selectCls} value={props.projectId} onChange={(e) => props.onProject(e.target.value)} aria-label="Project">
            {props.projects.length === 0 && <option value="">No projects</option>}
            {props.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className={selectCls}
            value={props.sprintId ?? "all"}
            onChange={(e) => props.onSprint(e.target.value === "all" ? undefined : e.target.value)}
            aria-label="Sprint"
          >
            <option value="all">All Sprints</option>
            {props.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "Active" ? " (active)" : ""}
              </option>
            ))}
          </select>

          {/* Date presets */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {DATE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => props.onPreset(p)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  props.preset === p ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {props.preset === "Custom" && (
            <div className="flex items-center gap-1">
              <input type="date" value={props.from} onChange={(e) => props.onFrom(e.target.value)} className={selectCls} />
              <span className="text-xs text-slate-400">→</span>
              <input type="date" value={props.to} onChange={(e) => props.onTo(e.target.value)} className={selectCls} />
            </div>
          )}

          <select className={selectCls} value={props.role} onChange={(e) => props.onRole(e.target.value as DashboardRole)} aria-label="Role view">
            {DASHBOARD_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Last updated / stale indicator */}
          <div className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:flex">
            <span className={cn("h-2 w-2 rounded-full", props.isFetching ? "animate-pulse bg-amber-400" : stale ? "bg-amber-400" : "bg-emerald-500")} />
            {props.isFetching ? "Updating…" : props.lastUpdated ? `Updated ${formatDistanceToNow(props.lastUpdated, { addSuffix: true })}` : "—"}
          </div>

          <button
            onClick={props.onToggleAutoRefresh}
            title={props.autoRefresh ? "Auto-refresh on (60s)" : "Auto-refresh off"}
            className={cn("rounded-lg border border-slate-200 p-2 hover:bg-slate-50", props.autoRefresh ? "text-indigo-600" : "text-slate-400")}
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={props.onRefresh}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", props.isFetching && "animate-spin")} /> Refresh
          </button>

          {props.exportSlot}
        </div>
      </div>

      {stale && !props.isFetching && (
        <div className="border-t border-amber-100 bg-amber-50 px-6 py-1.5 text-[11px] font-medium text-amber-700">
          Data may be stale — last updated {formatDistanceToNow(props.lastUpdated!, { addSuffix: true })}. Click Refresh to update.
        </div>
      )}
    </header>
  )
}

/** Hook: tick every 30s so the "updated X ago" label stays live. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
