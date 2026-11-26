"use client"

import { useEffect, useMemo, useState } from "react"
import {
  useTestsTable,
  useBugsTable,
  useRequirementsTable,
  useSprints,
  useAverageAge,
  type TableQuery,
} from "@/hooks/reports/use-analytics"
import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/reports/colors"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUp, ArrowDown, ArrowUpDown, Search, Download, ChevronLeft, ChevronRight, Eye } from "@/components/ui/icons"
import { formatDistanceToNow, format } from "date-fns"
import { cn } from "@/lib/utils"

import { SprintReport } from "./sprint-report"
import { EpicReport } from "./epic-report"

const TABS = [
  { id: "tests", label: "Tests" },
  { id: "bugs", label: "Bugs" },
  { id: "requirements", label: "Requirements" },
  { id: "sprints", label: "Sprints" },
  { id: "sprint-report", label: "Sprint Report" },
  { id: "epic-report", label: "Epic Report" },
  { id: "average-age", label: "Average Age" },
] as const
type TabId = (typeof TABS)[number]["id"]

export function TabbedTables({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<TabId>("tests")
  return (
    <div id="data-tables" className="rounded-xl border border-border bg-card shadow-sm transition-shadow">
      <div className="flex items-center gap-1 border-b border-border px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "tests" && <TestsTable projectId={projectId} />}
        {tab === "bugs" && <BugsTable projectId={projectId} />}
        {tab === "requirements" && <RequirementsTable projectId={projectId} />}
        {tab === "sprints" && <SprintsTable projectId={projectId} />}
        {tab === "sprint-report" && <SprintReport projectId={projectId} />}
        {tab === "epic-report" && <EpicReport projectId={projectId} />}
        {tab === "average-age" && <AverageAgeTable projectId={projectId} />}
      </div>
    </div>
  )
}

// ── Shared primitives ──

export function StatusBadge({ value, kind = "status" }: { value: string; kind?: "status" | "severity" }) {
  const color = (kind === "severity" ? SEVERITY_COLORS[value] : STATUS_COLORS[value]) || "#94a3b8"
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {value}
    </span>
  )
}

function Avatar({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-slate-300">—</span>
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
  return (
    <span className="inline-flex items-center gap-2" title={name}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials || "?"}</span>
      <span className="max-w-[90px] truncate text-xs text-muted-foreground">{name}</span>
    </span>
  )
}

function CoverageBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  )
}

interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  align?: "left" | "right"
  render: (row: T, index: number) => React.ReactNode
  csv?: (row: T) => string | number
}

function SortableHeader({
  col,
  sort,
  order,
  onSort,
}: {
  col: Column<any>
  sort: string | undefined
  order: "asc" | "desc"
  onSort: (key: string) => void
}) {
  const active = sort === col.key
  return (
    <th scope="col" className={cn("whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground", col.align === "right" && "text-right")}>
      {col.sortable ? (
        <button onClick={() => onSort(col.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
          {col.label}
          {active ? order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
        </button>
      ) : (
        col.label
      )}
    </th>
  )
}

function toCSV<T>(cols: Column<T>[], rows: T[]): string {
  const header = cols.map((c) => c.label).join(",")
  const body = rows
    .map((r, i) =>
      cols
        .map((c) => {
          const v = c.csv ? c.csv(r) : ""
          const s = String(v ?? "").replace(/"/g, '""')
          return /[",\n]/.test(s) ? `"${s}"` : s
        })
        .join(",")
    )
    .join("\n")
  return `${header}\n${body}`
}

function downloadCSV(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function useDebounced(value: string, ms = 300): string {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Pagination({
  page,
  limit,
  total,
  onPage,
  onLimit,
}: {
  page: number
  limit: number
  total: number
  onPage: (p: number) => void
  onLimit: (l: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / limit))
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(total, page * limit)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>
          Showing <b className="text-foreground">{start}</b>–<b className="text-foreground">{end}</b> of <b className="text-foreground">{total}</b>
        </span>
        <select
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-border p-1 disabled:opacity-40 hover:bg-muted/50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2">
          Page <b className="text-foreground">{page}</b> / {pages}
        </span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md border border-border p-1 disabled:opacity-40 hover:bg-muted/50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Server-paginated table wired to a hook returning { rows, totalCount }. */
function DataTable<T extends { id?: string }>({
  columns,
  data,
  loading,
  query,
  setQuery,
  csvName,
  filters,
}: {
  columns: Column<T>[]
  data?: { rows: T[]; totalCount: number }
  loading: boolean
  query: TableQuery
  setQuery: (patch: Partial<TableQuery>) => void
  csvName: string
  filters?: React.ReactNode
}) {
  const [searchInput, setSearchInput] = useState(query.search ?? "")
  const debounced = useDebounced(searchInput)
  useEffect(() => {
    if (debounced !== (query.search ?? "")) setQuery({ search: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const onSort = (key: string) => {
    if (query.sort === key) setQuery({ order: query.order === "asc" ? "desc" : "asc" })
    else setQuery({ sort: key, order: "asc" })
  }

  const rows = data?.rows ?? []

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border px-3">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search…"
            className="h-8 w-44 bg-transparent text-sm focus:outline-none"
          />
        </div>
        {filters}
        <button
          onClick={() => downloadCSV(csvName, toCSV(columns, rows))}
          disabled={rows.length === 0}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{csvName}</caption>
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => (
                <SortableHeader key={c.key} col={c} sort={query.sort} order={query.order ?? "desc"} onSort={onSort} />
              ))}
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-3">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                  <td />
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No matching rows.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id ?? i} className="group border-t border-border hover:bg-muted/60">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-3 py-3 text-foreground", c.align === "right" && "text-right")}>
                      {c.render(row, (query.page - 1) * query.limit + i)}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <button className="text-slate-300 opacity-0 transition-opacity hover:text-primary group-hover:opacity-100" title="View">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={query.page}
        limit={query.limit}
        total={data?.totalCount ?? 0}
        onPage={(p) => setQuery({ page: p })}
        onLimit={(l) => setQuery({ limit: l, page: 1 })}
      />
    </div>
  )
}

// ── State helper ──
function useTableQuery(projectId: string, initial?: Partial<TableQuery>) {
  const [query, setQueryState] = useState<TableQuery>({ projectId, page: 1, limit: 10, order: "desc", ...initial })
  useEffect(() => setQueryState((q) => ({ ...q, projectId, page: 1 })), [projectId])
  const setQuery = (patch: Partial<TableQuery>) => setQueryState((q) => ({ ...q, ...patch }))
  return { query, setQuery }
}

function relative(iso: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "—"
}

// ── Tests ──
function TestsTable({ projectId }: { projectId: string }) {
  const { query, setQuery } = useTableQuery(projectId, { sort: "updatedAt" })
  const { data, isFetching } = useTestsTable(query)
  const columns: Column<any>[] = [
    { key: "index", label: "#", render: (_r, i) => <span className="text-muted-foreground">{i + 1}</span>, csv: (_r) => "" },
    { key: "title", label: "Title", sortable: true, render: (r) => <span className="font-medium text-foreground">{r.title}</span>, csv: (r) => r.title },
    { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} />, csv: (r) => r.status },
    { key: "assignee", label: "Assignee", render: (r) => <Avatar name={r.assignee} />, csv: (r) => r.assignee ?? "" },
    { key: "priority", label: "Priority", sortable: true, render: (r) => <StatusBadge value={r.priority} kind="severity" />, csv: (r) => r.priority },
    { key: "lastRun", label: "Last Run", render: (r) => <span className="text-xs text-muted-foreground">{relative(r.lastRun)}</span>, csv: (r) => r.lastRun ?? "" },
    { key: "durationMs", label: "Duration", align: "right", render: (r) => <span className="text-xs tabular-nums text-muted-foreground">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</span>, csv: (r) => r.durationMs },
    { key: "tags", label: "Tags", render: (r) => <span className="text-xs text-muted-foreground">{(r.tags || []).slice(0, 2).join(", ") || "—"}</span>, csv: (r) => (r.tags || []).join("|") },
  ]
  return <DataTable columns={columns} data={data} loading={isFetching && !data} query={query} setQuery={setQuery} csvName="tests.csv" />
}

// ── Bugs ──
function BugsTable({ projectId }: { projectId: string }) {
  const { query, setQuery } = useTableQuery(projectId, { sort: "createdAt" })
  const { data, isFetching } = useBugsTable(query)
  const filters = (
    <>
      <select value={query.severity ?? "all"} onChange={(e) => setQuery({ severity: e.target.value, page: 1 })} className="h-8 rounded-md border border-border bg-card px-2 text-xs">
        {["all", "Critical", "High", "Medium", "Low"].map((s) => <option key={s} value={s}>{s === "all" ? "All severities" : s}</option>)}
      </select>
      <select value={query.status ?? "all"} onChange={(e) => setQuery({ status: e.target.value, page: 1 })} className="h-8 rounded-md border border-border bg-card px-2 text-xs">
        {["all", "Open", "InProgress", "Resolved", "Closed", "Reopened"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
      </select>
    </>
  )
  const columns: Column<any>[] = [
    { key: "key", label: "Key", render: (r) => <span className="font-mono text-xs font-semibold text-rose-600">{r.key}</span>, csv: (r) => r.key },
    { key: "title", label: "Title", sortable: true, render: (r) => <span className="font-medium text-foreground">{r.title}</span>, csv: (r) => r.title },
    { key: "severity", label: "Severity", sortable: true, render: (r) => <StatusBadge value={r.severity} kind="severity" />, csv: (r) => r.severity },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge value={r.status} />, csv: (r) => r.status },
    { key: "assignee", label: "Assignee", render: (r) => <Avatar name={r.assignee} />, csv: (r) => r.assignee ?? "" },
    { key: "createdAt", label: "Created", sortable: true, render: (r) => <span className="text-xs text-muted-foreground">{relative(r.created)}</span>, csv: (r) => r.created },
    { key: "component", label: "Component", render: (r) => <span className="text-xs text-muted-foreground">{r.component}</span>, csv: (r) => r.component },
  ]
  return <DataTable columns={columns} data={data} loading={isFetching && !data} query={query} setQuery={setQuery} csvName="bugs.csv" filters={filters} />
}

// ── Requirements ──
function RequirementsTable({ projectId }: { projectId: string }) {
  const { query, setQuery } = useTableQuery(projectId, { sort: "createdAt" })
  const { data, isFetching } = useRequirementsTable(query)
  const columns: Column<any>[] = [
    { key: "key", label: "Key", sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-primary">{r.key}</span>, csv: (r) => r.key },
    { key: "title", label: "Title", sortable: true, render: (r) => <span className="font-medium text-foreground">{r.title}</span>, csv: (r) => r.title },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge value={r.status} />, csv: (r) => r.status },
    { key: "coverage", label: "Coverage", render: (r) => <CoverageBar value={r.coverage} />, csv: (r) => `${r.coverage}%` },
    { key: "linkedTests", label: "Linked Tests", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.linkedTests}</span>, csv: (r) => r.linkedTests },
    { key: "lastTested", label: "Last Tested", render: (r) => <span className="text-xs text-muted-foreground">{relative(r.lastTested)}</span>, csv: (r) => r.lastTested },
  ]
  return <DataTable columns={columns} data={data} loading={isFetching && !data} query={query} setQuery={setQuery} csvName="requirements.csv" />
}

// ── Sprints (client-side, small dataset) ──
function SprintsTable({ projectId }: { projectId: string }) {
  const { data, isFetching } = useSprints(projectId)
  const { query, setQuery } = useTableQuery(projectId, { limit: 100 })
  const columns: Column<any>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium text-foreground">{r.name}</span>, csv: (r) => r.name },
    { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} />, csv: (r) => r.status },
    { key: "startDate", label: "Start", render: (r) => <span className="text-xs text-muted-foreground">{r.startDate ? format(new Date(r.startDate), "MMM d") : "—"}</span>, csv: (r) => r.startDate ?? "" },
    { key: "endDate", label: "End", render: (r) => <span className="text-xs text-muted-foreground">{r.endDate ? format(new Date(r.endDate), "MMM d") : "—"}</span>, csv: (r) => r.endDate ?? "" },
    { key: "committed", label: "Committed", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.committed}</span>, csv: (r) => r.committed },
    { key: "completed", label: "Completed", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.completed}</span>, csv: (r) => r.completed },
    { key: "velocity", label: "Velocity", align: "right", render: (r) => <span className="tabular-nums font-semibold text-primary">{r.velocity}</span>, csv: (r) => r.velocity },
    { key: "progress", label: "Progress", render: (r) => <CoverageBar value={r.progress} />, csv: (r) => `${r.progress}%` },
  ]
  // Client-side search over the small sprint set.
  const filtered = useMemo(() => {
    const rows = data?.rows ?? []
    const q = (query.search ?? "").toLowerCase()
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  }, [data, query.search])
  return (
    <DataTable
      columns={columns}
      data={{ rows: filtered, totalCount: filtered.length }}
      loading={isFetching && !data}
      query={query}
      setQuery={setQuery}
      csvName="sprints.csv"
    />
  )
}

// ── Average Age ──
function AverageAgeTable({ projectId }: { projectId: string }) {
  const { data, isFetching } = useAverageAge(projectId)
  const rows = data ?? []
  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      TODO: "bg-muted text-muted-foreground",
      IN_PROGRESS: "bg-blue-100 text-blue-700",
      REVIEW: "bg-violet-100 text-violet-700",
      TESTING: "bg-amber-100 text-amber-700",
      DEPLOYED: "bg-emerald-100 text-emerald-700",
    }
    return map[status] || "bg-muted text-muted-foreground"
  }
  return (
    <div>
      {isFetching && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">All tasks are completed — nothing aging.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Status</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Open Tasks</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Avg Age (days)</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Oldest (days)</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Health</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/60">
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(row.status)}`}>
                      {row.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">{row.count}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">{row.averageAgeDays}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{row.oldestDays}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${row.averageAgeDays > 14 ? "bg-rose-500" : row.averageAgeDays > 7 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, (row.averageAgeDays / 21) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {row.averageAgeDays > 14 ? "High" : row.averageAgeDays > 7 ? "Moderate" : "Good"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
