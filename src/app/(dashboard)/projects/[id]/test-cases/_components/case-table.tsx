"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import {
  useCaseBrowse,
  type CaseRow,
  type LibraryFilters,
  type SortKey,
} from "../_hooks/use-test-library"
import { STATUS_META, PRIORITY_META, relativeTime } from "./config"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bug,
  ClipboardList,
  CloudUpload,
  FlaskConical,
  Link2,
  Zap,
} from "lucide-react"

/**
 * The case list.
 *
 * Columns are shown or hidden according to the width of THIS PANEL, measured
 * with a ResizeObserver — not Tailwind's `lg:` / `xl:` breakpoints, which read
 * the viewport. That distinction was a real bug: on a wide monitor every
 * breakpoint matched, so all six columns rendered even when the detail panel
 * had squeezed the centre to ~760px. The fixed columns consumed 680px of it and
 * the title collapsed to a couple of characters, overlapping its neighbour.
 *
 * Widths are in px so the visibility maths is explicit and checkable.
 */

const COL = {
  select: 32,
  suite: 150,
  priority: 88,
  type: 96,
  lastRun: 140,
  links: 88,
} as const

const GAP = 12
/** Never let the title get narrower than this before dropping a column. */
const MIN_TITLE = 220

/**
 * Decides which optional columns fit, dropping them in reverse priority order.
 * Pure so it can be reasoned about (and tested) without a DOM.
 */
export function visibleColumns(width: number) {
  // Least → most important. Dropped from the front as space runs out.
  const order = ["type", "links", "suite", "priority"] as const
  const shown = new Set<(typeof order)[number]>(order)

  const used = () =>
    COL.select +
    COL.lastRun +
    Array.from(shown).reduce((sum, k) => sum + COL[k], 0) +
    GAP * (shown.size + 2)

  for (const key of order) {
    if (width - used() >= MIN_TITLE) break
    shown.delete(key)
  }

  return {
    suite: shown.has("suite"),
    priority: shown.has("priority"),
    type: shown.has("type"),
    links: shown.has("links"),
  }
}

type Visible = ReturnType<typeof visibleColumns>

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  return { ref, width }
}

export function CaseTable({
  projectId,
  filters,
  onChangeFilters,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  activeId,
  onOpen,
  onDragSelection,
}: {
  projectId: string
  filters: LibraryFilters
  onChangeFilters: (next: LibraryFilters) => void
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[]) => void
  activeId: string | null
  onOpen: (id: string) => void
  onDragSelection: (ids: string[]) => void
}) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCaseBrowse(projectId, filters)

  const { ref, width } = useContainerWidth<HTMLDivElement>()
  const visible = useMemo(() => visibleColumns(width || 900), [width])

  const rows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data])
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id))

  function setSort(key: SortKey) {
    const sameKey = filters.sort === key
    onChangeFilters({
      ...filters,
      sort: key,
      dir: sameKey && filters.dir === "desc" ? "asc" : "desc",
    })
  }

  if (isError) {
    const message = (error as Error)?.message ?? ""
    const needsMigration = /migration/i.test(message)

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div
          className={cn(
            "rounded-full p-3",
            needsMigration ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"
          )}
        >
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold">
          {needsMigration ? "Database migration required" : "Couldn't load test cases"}
        </p>
        {needsMigration ? (
          <div className="max-w-md space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              The test library needs the <code className="rounded bg-muted px-1">TestSuite</code>{" "}
              table and the execution rollup columns. Run these, then reload:
            </p>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-left text-[11px] leading-relaxed">
{`npx prisma generate
npx prisma migrate deploy
npx tsx scripts/backfill-test-suites.ts --apply`}
            </pre>
          </div>
        ) : (
          <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
        )}
      </div>
    )
  }

  const SortButton = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      onClick={() => setSort(sortKey)}
      className="inline-flex items-center gap-1 truncate transition-colors hover:text-foreground"
    >
      {label}
      {filters.sort === sortKey &&
        (filters.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
    </button>
  )

  return (
    <div ref={ref} className="flex h-full flex-col">
      {/* Header — mirrors Row's column widths exactly. */}
      <div
        className="flex shrink-0 items-center border-b bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ gap: GAP }}
      >
        <div style={{ width: COL.select }} className="shrink-0">
          <input
            type="checkbox"
            aria-label="Select all loaded"
            checked={allVisibleSelected}
            disabled={rows.length === 0}
            onChange={() => onToggleAll(rows.map((r) => r.id))}
            className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <SortButton label="Title" sortKey="title" />
        </div>
        {visible.suite && (
          <div style={{ width: COL.suite }} className="shrink-0 truncate">
            Suite
          </div>
        )}
        {visible.priority && (
          <div style={{ width: COL.priority }} className="shrink-0">
            <SortButton label="Priority" sortKey="priority" />
          </div>
        )}
        {visible.type && (
          <div style={{ width: COL.type }} className="shrink-0 truncate">
            Type
          </div>
        )}
        <div style={{ width: COL.lastRun }} className="shrink-0">
          <SortButton label="Last run" sortKey="lastRunAt" />
        </div>
        {visible.links && (
          <div style={{ width: COL.links }} className="shrink-0 truncate">
            Links
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-1 p-3" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <FlaskConical className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold">No test cases match</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {filters.q || filters.status?.length || filters.trace || filters.suite
              ? "Try clearing a filter, or pick a different suite."
              : "Create one manually, record a session, or import from a spreadsheet."}
          </p>
        </div>
      ) : (
        <Virtuoso
          className="flex-1"
          data={rows}
          endReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage()
          }}
          itemContent={(_, row) => (
            <Row
              row={row}
              visible={visible}
              checked={selectedIds.includes(row.id)}
              active={activeId === row.id}
              onToggle={() => onToggleSelect(row.id)}
              onOpen={() => onOpen(row.id)}
              onDragStart={() =>
                onDragSelection(selectedIds.includes(row.id) ? selectedIds : [row.id])
              }
              onDragEnd={() => onDragSelection([])}
            />
          )}
          components={{
            Footer: () =>
              isFetchingNextPage ? (
                <p className="py-3 text-center text-[11px] text-muted-foreground">Loading more…</p>
              ) : hasNextPage ? (
                <div className="h-4" />
              ) : (
                <p className="py-3 text-center text-[11px] text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "case" : "cases"}
                </p>
              ),
          }}
        />
      )}
    </div>
  )
}

function Row({
  row,
  visible,
  checked,
  active,
  onToggle,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  row: CaseRow
  visible: Visible
  checked: boolean
  active: boolean
  onToggle: () => void
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const status = STATUS_META[row.lastStatus]
  const StatusIcon = status.icon

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{ gap: GAP }}
      className={cn(
        "flex cursor-pointer items-center border-b px-4 py-2.5 text-sm transition-colors",
        active ? "bg-primary/5" : "hover:bg-accent/40",
        checked && "bg-primary/[0.07]"
      )}
    >
      <div style={{ width: COL.select }} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${row.title}`}
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))]"
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <StatusIcon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            row.lastStatus === "Passed" && "text-emerald-500",
            row.lastStatus === "Failed" && "text-red-500",
            row.lastStatus === "Blocked" && "text-orange-500",
            row.lastStatus === "Warning" && "text-amber-500",
            (row.lastStatus === "NotExecuted" || row.lastStatus === "Skipped") &&
              "text-muted-foreground/50"
          )}
        />
        <span className="min-w-0 truncate font-medium" title={row.title}>
          {row.title}
        </span>
        {row.isOrphan && (
          <span
            title="Covers no user story"
            className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
          >
            orphan
          </span>
        )}
      </div>

      {visible.suite && (
        <div style={{ width: COL.suite }} className="shrink-0 truncate text-xs text-muted-foreground">
          {row.suite?.name ?? <span className="opacity-50">Unfiled</span>}
        </div>
      )}

      {visible.priority && (
        <div style={{ width: COL.priority }} className="shrink-0">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              PRIORITY_META[row.priority].chip
            )}
          >
            {PRIORITY_META[row.priority].label}
          </span>
        </div>
      )}

      {visible.type && (
        <div
          style={{ width: COL.type }}
          className="shrink-0 truncate text-[11px] text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1">
            {row.executionType === "Automated" ? (
              <Zap className="h-3 w-3 shrink-0 text-violet-500" />
            ) : (
              <ClipboardList className="h-3 w-3 shrink-0" />
            )}
            {row.executionType}
          </span>
        </div>
      )}

      <div style={{ width: COL.lastRun }} className="shrink-0 truncate text-xs">
        <span className={cn("rounded px-1.5 py-0.5", status.chip)}>{status.label}</span>
        {row.lastRunAt && (
          <span className="ml-1.5 tabular-nums text-muted-foreground">
            {relativeTime(row.lastRunAt)}
          </span>
        )}
      </div>

      {visible.links && (
        <div
          style={{ width: COL.links }}
          className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground"
        >
          {row.requirementCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${row.requirementCount} linked story(s)`}>
              <Link2 className="h-3 w-3" />
              {row.requirementCount}
            </span>
          )}
          {row.openBugCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"
              title={`${row.openBugCount} open bug(s)`}
            >
              <Bug className="h-3 w-3" />
              {row.openBugCount}
            </span>
          )}
          {row.sync && (
            <span
              className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
              title="Synced to OpenProject"
            >
              <CloudUpload className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
