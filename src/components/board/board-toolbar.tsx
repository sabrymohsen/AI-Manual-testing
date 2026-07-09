"use client"

import { useMemo } from "react"
import { Search, ChevronDown, X, Settings2, Maximize2, Minimize2, Tag, User } from "lucide-react"
import { type BoardConfig, type SwimlaneMode, type CardColorMode } from "./board-config"
import { Story } from "./shared"

interface BoardToolbarProps {
  stories: Story[]
  config: BoardConfig
  onChange: (config: BoardConfig) => void
  search: string
  onSearch: (val: string) => void
  onOpenSettings: () => void
}

export default function BoardToolbar({ stories, config, onChange, search, onSearch, onOpenSettings }: BoardToolbarProps) {
  const allAssignees = useMemo(() => {
    const set = new Set<string>()
    stories.forEach((s) => { if (s.assignee) set.add(s.assignee) })
    return Array.from(set).sort()
  }, [stories])

  const allLabels = useMemo(() => {
    const set = new Set<string>()
    stories.forEach((s) => s.labels.forEach((l) => set.add(l)))
    return Array.from(set).sort()
  }, [stories])

  const hasFilters =
    config.quickFilters.assignees.length > 0 ||
    config.quickFilters.priorities.length > 0 ||
    config.quickFilters.labels.length > 0 ||
    config.quickFilters.types.length > 0

  const toggleFilter = (field: keyof BoardConfig["quickFilters"], value: string) => {
    const arr = config.quickFilters[field]
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
    onChange({ ...config, quickFilters: { ...config.quickFilters, [field]: next } })
  }

  const clearFilters = () => {
    onChange({ ...config, quickFilters: { assignees: [], priorities: [], labels: [], types: [] } })
  }

  const PRIORITY_BADGES: Record<string, string> = {
    Low: "hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-300",
    Medium: "hover:bg-amber-50 dark:hover:bg-amber-950/20 border-amber-200 text-amber-700 dark:text-amber-300",
    High: "hover:bg-orange-50 dark:hover:bg-orange-950/20 border-orange-200 text-orange-700 dark:text-orange-300",
    Critical: "hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 text-red-700 dark:text-red-300",
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm backdrop-blur-md">
      {/* Main toolbar row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter issues..."
            className="pl-10 pr-3 h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-background w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
          />
        </div>

        {/* Swimlane selector */}
        <div className="relative">
          <select
            value={config.swimlaneMode}
            onChange={(e) => onChange({ ...config, swimlaneMode: e.target.value as SwimlaneMode })}
            className="h-9 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-background pl-3.5 pr-9 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
          >
            <option value="none">Group: None</option>
            <option value="assignee">Group: Assignee</option>
            <option value="epic">Group: Epic</option>
            <option value="parent">Group: Parent</option>
          </select>
          <ChevronDown className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>

        {/* Color mode */}
        <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-background p-0.5">
          {(["priority", "epic", "none"] as CardColorMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onChange({ ...config, cardColorMode: mode })}
              className={`h-8 px-3 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 ${config.cardColorMode === mode ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Size toggle */}
        <button
          onClick={() => onChange({ ...config, cardSize: config.cardSize === "compact" ? "normal" : "compact" })}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-background hover:bg-muted text-muted-foreground transition-all shadow-sm"
          title={config.cardSize === "compact" ? "Normal view" : "Compact view"}
        >
          {config.cardSize === "compact" ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-background hover:bg-muted text-muted-foreground transition-all shadow-sm"
          title="Board settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Quick filter chips */}
      <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 dark:border-slate-800/40 pt-2">
        {/* Priority chips */}
        {(["Low", "Medium", "High", "Critical"] as const).map((p) => {
          const active = config.quickFilters.priorities.includes(p)
          return (
            <button
              key={p}
              onClick={() => toggleFilter("priorities", p)}
              className={`h-7 px-3 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all ${active ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : PRIORITY_BADGES[p]}`}
            >
              {p}
            </button>
          )
        })}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Type chips */}
        {(["Story", "Task", "Bug"] as const).map((t) => {
          const active = config.quickFilters.types.includes(t)
          const colors = t === "Bug" ? "border-red-200 text-red-600" : t === "Task" ? "border-sky-200 text-sky-655" : "border-emerald-200 text-emerald-600"
          return (
            <button
              key={t}
              onClick={() => toggleFilter("types", t)}
              className={`h-7 px-3 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all ${active ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : `bg-background hover:bg-muted ${colors}`}`}
            >
              {t}
            </button>
          )
        })}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Assignee dropdown */}
        {allAssignees.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => { if (e.target.value) { toggleFilter("assignees", e.target.value); e.target.value = "" } }}
              className="h-7 text-[10px] font-extrabold uppercase tracking-wider rounded-xl border border-slate-200 dark:border-slate-800 bg-background pl-2.5 pr-7 appearance-none cursor-pointer shadow-sm focus:outline-none"
            >
              <option value="">Assignee</option>
              {allAssignees.map((a) => (
                <option key={a} value={a}>{config.quickFilters.assignees.includes(a) ? "✓ " : ""}{a}</option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/60" />
          </div>
        )}

        {/* Label dropdown */}
        {allLabels.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => { if (e.target.value) { toggleFilter("labels", e.target.value); e.target.value = "" } }}
              className="h-7 text-[10px] font-extrabold uppercase tracking-wider rounded-xl border border-slate-200 dark:border-slate-800 bg-background pl-2.5 pr-7 appearance-none cursor-pointer shadow-sm focus:outline-none"
            >
              <option value="">Label</option>
              {allLabels.map((l) => (
                <option key={l} value={l}>{config.quickFilters.labels.includes(l) ? "✓ " : ""}{l}</option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/60" />
          </div>
        )}

        {/* Active filter pills */}
        {config.quickFilters.assignees.map((a) => (
          <span key={`a-${a}`} className="h-7 pl-3 pr-1 rounded-xl bg-indigo-50 border border-indigo-150 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
            <User className="h-3 w-3" /> {a} <button onClick={() => toggleFilter("assignees", a)} className="hover:bg-indigo-200/50 rounded p-0.5"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {config.quickFilters.labels.map((l) => (
          <span key={`l-${l}`} className="h-7 pl-3 pr-1 rounded-xl bg-indigo-50 border border-indigo-150 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
            <Tag className="h-3 w-3" /> {l} <button onClick={() => toggleFilter("labels", l)} className="hover:bg-indigo-200/50 rounded p-0.5"><X className="h-3 w-3" /></button>
          </span>
        ))}

        {hasFilters && (
          <button onClick={clearFilters} className="h-7 px-3.5 rounded-xl border border-dashed text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
