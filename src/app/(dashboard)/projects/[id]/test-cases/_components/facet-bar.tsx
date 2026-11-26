"use client"

import { useEffect, useState } from "react"
import { useFacets, type CaseStatus, type LibraryFilters } from "../_hooks/use-test-library"
import { STATUS_META, STATUS_ORDER } from "./config"
import { cn } from "@/lib/utils"
import { Bug as BugBeetle, Link2Off as LinkBreak } from "@/components/ui/icons"

/**
 * Results bar: the latest result of every case in the current scope, drawn as
 * one bar split by status. Each part (and its legend entry) filters the list,
 * so the bar is both the summary and the quickest way to "show me what failed".
 *
 * Counts come from the facets query, which applies every filter except status,
 * so the bar keeps showing the whole picture while a status is selected.
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
  const { data, isLoading } = useFacets(projectId, filters)
  // Grow the bar once when the numbers first arrive.
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    if (!data) return
    const t = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(t)
  }, [data])

  const active = filters.status ?? []
  const toggleStatus = (s: CaseStatus) => {
    const next = active.includes(s) ? active.filter((x) => x !== s) : [...active, s]
    onChange({ ...filters, status: next.length ? next : undefined })
  }
  const toggleTrace = (t: "orphans" | "broken") =>
    onChange({ ...filters, trace: filters.trace === t ? undefined : t })

  if (isLoading || !data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-2.5 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  const total = data.total ?? 0
  const parts = STATUS_ORDER.map((s) => ({ s, n: data.byStatus[s] ?? 0 })).filter((p) => p.n > 0)
  const legend = STATUS_ORDER.filter((s) => (data.byStatus[s] ?? 0) > 0 || s === "Passed" || s === "Failed" || s === "NotExecuted")
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <div className="space-y-3">
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          total === 0
            ? "No test cases in this view"
            : parts.map((p) => `${p.n} ${STATUS_META[p.s].label.toLowerCase()}`).join(", ")
        }
      >
        {parts.map(({ s, n }) => (
          <button
            key={s}
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => toggleStatus(s)}
            title={`${n} ${STATUS_META[s].label.toLowerCase()} (${pct(n)}%)`}
            style={{ flexGrow: grown ? n : 0, flexBasis: 0 }}
            className={cn(
              "h-full min-w-[4px] transition-[flex-grow,opacity] duration-700 ease-out-soft motion-reduce:transition-none",
              STATUS_META[s].dot,
              active.length > 0 && !active.includes(s) && "opacity-30"
            )}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {legend.map((s) => {
          const n = data.byStatus[s] ?? 0
          const on = active.includes(s)
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-pressed={on}
              className={cn(
                "inline-flex h-7 items-center gap-2 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                n === 0 && !on && "opacity-60"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} aria-hidden />
              <span className="font-semibold tabular-nums text-foreground">{n}</span>
              {STATUS_META[s].label.toLowerCase()}
              {total > 0 && n > 0 && <span className="tabular-nums opacity-70">{pct(n)}%</span>}
            </button>
          )
        })}

        <span className="ms-auto" />

        <TraceButton
          on={filters.trace === "broken"}
          count={data.broken ?? 0}
          onClick={() => toggleTrace("broken")}
          icon={BugBeetle}
          label="failed with no bug filed"
          tone="text-red-600"
          title="The last run failed and no open bug tracks it"
        />
        <TraceButton
          on={filters.trace === "orphans"}
          count={data.orphans ?? 0}
          onClick={() => toggleTrace("orphans")}
          icon={LinkBreak}
          label="not linked to a story"
          tone="text-amber-600"
          title="Coverage reports don't count cases that aren't linked to a user story"
        />
      </div>
    </div>
  )
}

function TraceButton({
  on,
  count,
  onClick,
  icon: Icon,
  label,
  tone,
  title,
}: {
  on: boolean
  count: number
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  tone: string
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      disabled={count === 0 && !on}
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50",
        on ? "bg-accent text-foreground" : "text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", count > 0 ? tone : "")} aria-hidden />
      <span className={cn("font-semibold tabular-nums", count > 0 ? "text-foreground" : "")}>{count}</span>
      {label}
    </button>
  )
}
