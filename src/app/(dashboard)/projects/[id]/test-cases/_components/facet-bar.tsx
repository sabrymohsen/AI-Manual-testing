"use client"

import { useFacets, type CaseStatus, type LibraryFilters } from "../_hooks/use-test-library"
import { STATUS_META, STATUS_ORDER } from "./config"
import { cn } from "@/lib/utils"
import { Layers, ShieldAlert, AlertCircle } from "lucide-react"

/**
 * Header counts that are also filters.
 *
 * On the old page these chips were decorative — computed by filtering the
 * whole in-memory array four times per render, and not clickable. Counts now
 * come from a single aggregate query and toggling one narrows the list.
 */
export function FacetBar({
  projectId,
  filters,
  onChange,
}: {
  projectId: string
  filters: LibraryFilters
  onChange: (next: LibraryFilters) => void
}) {
  const { data, isLoading } = useFacets(projectId)

  const toggleStatus = (s: CaseStatus) => {
    const active = filters.status ?? []
    const next = active.includes(s) ? active.filter((x) => x !== s) : [...active, s]
    onChange({ ...filters, status: next.length ? next : undefined })
  }

  const toggleTrace = (t: "orphans" | "broken") =>
    onChange({ ...filters, trace: filters.trace === t ? undefined : t })

  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    )
  }

  const statusChips = STATUS_ORDER.filter((s) => (data?.byStatus[s] ?? 0) > 0 || s === "Passed" || s === "Failed")

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      <button
        onClick={() => onChange({ ...filters, status: undefined, trace: undefined })}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
          !filters.status?.length && !filters.trace
            ? "border-primary bg-primary/10 text-primary"
            : "bg-background text-foreground hover:bg-accent"
        )}
      >
        <Layers className="h-3 w-3" />
        {data?.total ?? 0} total
      </button>

      {statusChips.map((s) => {
        const meta = STATUS_META[s]
        const on = filters.status?.includes(s) ?? false
        const count = data?.byStatus[s] ?? 0
        return (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            aria-pressed={on}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
              on ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent",
              !on && count === 0 && "text-muted-foreground"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {count} {meta.label.toLowerCase()}
          </button>
        )
      })}

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <button
        onClick={() => toggleTrace("orphans")}
        aria-pressed={filters.trace === "orphans"}
        title="Test cases that cover no user story"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
          filters.trace === "orphans"
            ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <ShieldAlert className="h-3 w-3" />
        {data?.orphans ?? 0} orphans
      </button>

      <button
        onClick={() => toggleTrace("broken")}
        aria-pressed={filters.trace === "broken"}
        title="Never executed, or failed with no bug filed"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
          filters.trace === "broken"
            ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <AlertCircle className="h-3 w-3" />
        {data?.broken ?? 0} broken links
      </button>
    </div>
  )
}
