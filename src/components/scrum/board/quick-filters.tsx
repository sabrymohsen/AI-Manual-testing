"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { User, Clock, BookOpen, X, ArrowUp, AlertTriangle } from "lucide-react"

export type QuickFilter = "my-issues" | "recently-updated" | "only-stories" | "high-priority" | "overdue" | null

interface QuickFiltersProps {
  onChange: (filters: QuickFilter[]) => void
  activeFilters: QuickFilter[]
}

const FILTERS: { key: QuickFilter; label: string; icon: React.ReactNode }[] = [
  { key: "my-issues", label: "My Issues", icon: <User className="h-3 w-3" /> },
  { key: "recently-updated", label: "Recently Updated", icon: <Clock className="h-3 w-3" /> },
  { key: "only-stories", label: "Only Stories", icon: <BookOpen className="h-3 w-3" /> },
  { key: "high-priority", label: "High Priority", icon: <ArrowUp className="h-3 w-3" /> },
  { key: "overdue", label: "Overdue", icon: <AlertTriangle className="h-3 w-3" /> },
]

export function QuickFilters({ onChange, activeFilters }: QuickFiltersProps) {
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(
    (key: QuickFilter) => {
      const next = activeFilters.includes(key)
        ? activeFilters.filter((f) => f !== key)
        : [...activeFilters, key]
      onChange(next)
    },
    [activeFilters, onChange]
  )

  const clearAll = useCallback(() => {
    onChange([])
  }, [onChange])

  const visibleFilters = expanded ? FILTERS : FILTERS.slice(0, 3)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B778C]/60">Quick Filters</span>
      {visibleFilters.map((f) => {
        const active = activeFilters.includes(f.key)
        return (
          <button
            key={f.key}
            onClick={() => toggle(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
              active
                ? "border-[#0052CC] bg-[#DEEBFF] text-[#0052CC]"
                : "border-[#DFE1E6] bg-white text-[#6B778C] hover:bg-[#F4F5F7] hover:text-[#172B4D]"
            )}
          >
            {f.icon}
            {f.label}
            {active && <X className="h-3 w-3" />}
          </button>
        )
      })}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] font-semibold text-[#0052CC] hover:text-[#0747A6] transition-colors"
        >
          + More
        </button>
      )}
      {activeFilters.length > 0 && (
        <button
          onClick={clearAll}
          className="text-[10px] font-semibold text-[#6B778C] hover:text-[#172B4D] transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
