"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { User, Clock, BookOpen, X, ArrowUp, AlertTriangle } from "@/components/ui/icons"

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
    <div className="flex items-center gap-2 whitespace-nowrap">
      {visibleFilters.map((f) => {
        const active = activeFilters.includes(f.key)
        return (
          <button
            key={f.key}
            onClick={() => toggle(f.key)}
            className={cn(
              "inline-flex h-6 items-center gap-2 rounded-md border px-2 text-xs transition-colors",
              active
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
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
          className="h-6 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          + More
        </button>
      )}
      {activeFilters.length > 0 && (
        <button
          onClick={clearAll}
          className="h-6 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}
