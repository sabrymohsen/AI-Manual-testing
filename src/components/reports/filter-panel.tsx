"use client"

import { cn } from "@/lib/utils"
import { Filter, Calendar, Folder, Timer, User, X } from "lucide-react"

interface FilterPanelProps {
  projectId: string
  onProjectChange: (id: string) => void
  projects: { id: string; name: string }[]
  sprintId?: string
  onSprintChange: (id: string | undefined) => void
  sprints: { id: string; name: string; status: string }[]
  preset: string
  onPresetChange: (p: string) => void
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  role: string
  onRoleChange: (r: string) => void
  className?: string
}

const PRESETS = [
  { value: "7D", label: "Last 7 days" },
  { value: "30D", label: "Last 30 days" },
  { value: "90D", label: "Last 90 days" },
  { value: "YTD", label: "Year to date" },
  { value: "Custom", label: "Custom range" },
]

const ROLES = ["PM", "QA Manager", "Test Lead", "Developer"]

export function FilterPanel({
  projectId,
  onProjectChange,
  projects,
  sprintId,
  onSprintChange,
  sprints,
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  role,
  onRoleChange,
  className,
}: FilterPanelProps) {
  const selectCls = "w-full h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"

  return (
    <div className={cn("w-64 shrink-0 border-r border-slate-200 bg-white", className)}>
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <h3 className="text-xs font-bold text-slate-700">Filters</h3>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Project */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Folder className="h-3 w-3" /> Project
          </label>
          <select className={selectCls} value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Sprint */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Timer className="h-3 w-3" /> Sprint
          </label>
          <select
            className={selectCls}
            value={sprintId ?? "all"}
            onChange={(e) => onSprintChange(e.target.value === "all" ? undefined : e.target.value)}
          >
            <option value="all">All sprints</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.status === "Active" ? "(Active)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Calendar className="h-3 w-3" /> Date Range
          </label>
          <select className={selectCls} value={preset} onChange={(e) => onPresetChange(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {preset === "Custom" && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                className="h-7 flex-1 rounded-md border border-slate-200 px-2 text-[10px]"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                className="h-7 flex-1 rounded-md border border-slate-200 px-2 text-[10px]"
              />
            </div>
          )}
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <User className="h-3 w-3" /> Role View
          </label>
          <select className={selectCls} value={role} onChange={(e) => onRoleChange(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Active filters summary */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex flex-wrap gap-1.5">
            <FilterBadge label={`Project: ${projects.find(p => p.id === projectId)?.name || "All"}`} />
            {sprintId && <FilterBadge label={`Sprint`} onRemove={() => onSprintChange(undefined)} />}
            <FilterBadge label={`${preset === "Custom" ? `${from} → ${to}` : PRESETS.find(p => p.value === preset)?.label}`} />
            <FilterBadge label={`Role: ${role}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterBadge({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-blue-900">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}
