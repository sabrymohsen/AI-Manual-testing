"use client"
/**
 * Automation Hub → Runs: every run in the project, newest first. Runs started
 * together (Run folder / Run all / a schedule / CI) are grouped.
 *
 * From here a tester can filter and search history, cancel a queued or
 * running run, re-run one or only a batch's failures, download a shareable
 * report, and compare two runs ("what newly broke?").
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Ban,
  CalendarClock,
  Download,
  GitCompareArrows,
  History,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import HubRunResults, { StatusBadge, formatDuration, isActive, type HubExecutionView } from "@/components/automation-hub/hub-run-results"
import HubAutomationTriggers from "@/components/automation-hub/hub-automation-triggers"
import { cn } from "@/lib/utils"

interface RunRow extends HubExecutionView {
  batchId: string | null
  executionTarget: string | null
  triggerSource?: string | null
  environment?: string | null
  triggeredByName?: string | null
}

type Group = { key: string; batchId: string | null; runs: RunRow[] }

const groupStatus = (runs: RunRow[]) =>
  runs.some((r) => isActive(r.status))
    ? runs.some((r) => r.status === "Running")
      ? "Running"
      : "Queued"
    : runs.some((r) => r.status === "Failed")
      ? "Failed"
      : runs.some((r) => r.status === "Cancelled")
        ? "Cancelled"
        : "Passed"

const SOURCE_LABEL: Record<string, string> = { manual: "Manual", rerun: "Re-run", schedule: "Schedule", ci: "CI", agent: "Browser Agent", local: "Computer" }
/** Runs the server can't repeat: Browser Agent runs (re-run them from that tab) and laptop projects. */
const notRerunnable = (source?: string | null) => source === "agent" || source === "local"

interface Filters {
  q: string
  status: "" | "Failed" | "Passed" | "Cancelled"
  source: "" | "manual" | "rerun" | "schedule" | "ci"
  from: string
  to: string
}

interface CompareResult {
  newlyFailing: string[]
  fixed: string[]
  stillFailing: string[]
  added: string[]
  removed: string[]
  stillPassing: number
}

export default function HubRunsSection({
  projectId,
  onOpenTrace,
  initialRunId,
}: {
  projectId: string
  onOpenTrace: (traceId: string) => void
  initialRunId?: string | null
}) {
  const [runs, setRuns] = useState<RunRow[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filters, setFilters] = useState<Filters>({ q: "", status: "", source: "", from: "", to: "" })
  const [debouncedQ, setDebouncedQ] = useState("")
  const [openId, setOpenId] = useState<string | null>(initialRunId ?? null)
  useEffect(() => {
    if (initialRunId) setOpenId(initialRunId)
  }, [initialRunId])
  const [detail, setDetail] = useState<HubExecutionView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pendingCancel, setPendingCancel] = useState<{ ids: string[]; label: string } | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [comparison, setComparison] = useState<CompareResult | null>(null)
  const [triggersOpen, setTriggersOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 300)
    return () => clearTimeout(t)
  }, [filters.q])

  const query = useCallback(
    (cursor?: string | null) => {
      const p = new URLSearchParams({ projectId, limit: "50" })
      if (debouncedQ) p.set("q", debouncedQ)
      if (filters.status) p.set("status", filters.status)
      if (filters.source) p.set("source", filters.source)
      if (filters.from) p.set("from", filters.from)
      if (filters.to) p.set("to", filters.to)
      if (cursor) p.set("cursor", cursor)
      return `/api/hub/runs?${p}`
    },
    [projectId, debouncedQ, filters.status, filters.source, filters.from, filters.to]
  )

  const load = useCallback(async () => {
    const res = await fetch(query())
    const d = await res.json().catch(() => ({}))
    setRuns(d.runs || [])
    setNextCursor(d.nextCursor ?? null)
  }, [query])

  useEffect(() => {
    load()
  }, [load])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const d = await (await fetch(query(nextCursor))).json()
      setRuns((r) => [...(r ?? []), ...(d.runs || [])])
      setNextCursor(d.nextCursor ?? null)
    } finally {
      setLoadingMore(false)
    }
  }

  // Refresh while anything is queued or running.
  useEffect(() => {
    if (!runs?.some((r) => isActive(r.status))) return
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [runs, load])

  // Full detail (log included) for the open run, kept fresh while it runs.
  useEffect(() => {
    if (!openId) return setDetail(null)
    let stop = false
    const fetchOne = async () => {
      const res = await fetch(`/api/hub/executions/${openId}`)
      const d = await res.json().catch(() => ({}))
      if (!stop && d.execution) setDetail(d.execution)
      return d.execution
    }
    fetchOne()
    const t = setInterval(async () => {
      const e = await fetchOne()
      if (e && !isActive(e.status)) clearInterval(t)
    }, 1500)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [openId])

  const groups: Group[] = useMemo(() => {
    const out: Group[] = []
    const byBatch = new Map<string, Group>()
    for (const r of runs || []) {
      if (r.batchId) {
        let g = byBatch.get(r.batchId)
        if (!g) {
          g = { key: r.batchId, batchId: r.batchId, runs: [] }
          byBatch.set(r.batchId, g)
          out.push(g)
        }
        g.runs.push(r)
      } else {
        out.push({ key: r.id, batchId: null, runs: [r] })
      }
    }
    return out
  }, [runs])

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || "Request failed")
    return d
  }

  async function rerun(key: string, body: Record<string, unknown>, label: string) {
    setBusy(key)
    try {
      const d = await post("/api/hub/runs", { projectId, ...body })
      toast.success(`${label} — ${d.executionIds.length} test file${d.executionIds.length === 1 ? "" : "s"} queued`)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function cancel(ids: string[]) {
    let n = 0
    for (const id of ids) {
      try {
        await post(`/api/hub/executions/${id}/cancel`)
        n++
      } catch {
        // already finished
      }
    }
    toast.success(n ? `Cancelled ${n} run${n === 1 ? "" : "s"}` : "Nothing left to cancel")
    load()
  }

  const togglePick = (ref: string) =>
    setPicked((p) => (p.includes(ref) ? p.filter((x) => x !== ref) : p.length >= 2 ? [p[1], ref] : [...p, ref]))

  useEffect(() => {
    setComparison(null)
    if (picked.length !== 2) return
    // Older run is the base.
    const at = (ref: string) => {
      const g = groups.find((x) => x.key === ref)
      return g ? new Date(g.runs[g.runs.length - 1].createdAt).getTime() : 0
    }
    const [base, head] = [...picked].sort((a, b) => at(a) - at(b))
    fetch(`/api/hub/compare?projectId=${projectId}&base=${base}&head=${head}`)
      .then((r) => r.json())
      .then((d) => (d.error ? toast.error(d.error) : setComparison(d)))
      .catch(() => toast.error("Couldn't compare these runs"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, projectId])

  const reportLinks = (ref: string) => (
    <span className="inline-flex items-center gap-1">
      <a
        href={`/api/hub/report?projectId=${projectId}&ref=${ref}&format=html`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Download a shareable HTML report"
      >
        <Download className="h-3 w-3" /> Report
      </a>
      <a
        href={`/api/hub/report?projectId=${projectId}&ref=${ref}&format=csv`}
        onClick={(e) => e.stopPropagation()}
        className="rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Download as CSV"
      >
        CSV
      </a>
    </span>
  )

  if (runs === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
      </div>
    )
  }

  const row = (r: RunRow, nested = false) => {
    const results = r.results || []
    const failed = results.filter((x) => ["failed", "timedOut", "interrupted"].includes(x.status)).length
    const open = openId === r.id
    return (
      <div key={r.id} className={nested ? "border-t" : ""}>
        <div
          className={cn(
            "flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50",
            nested && "pl-10",
            open && "bg-primary/10"
          )}
        >
          {compareMode && !nested && (
            <input
              type="checkbox"
              checked={picked.includes(r.id)}
              onChange={() => togglePick(r.id)}
              aria-label="Pick for comparison"
              className="accent-[hsl(var(--primary))]"
            />
          )}
          <button type="button" onClick={() => setOpenId(open ? null : r.id)} className="flex min-w-[160px] flex-1 items-center gap-3 text-left">
            <StatusBadge status={r.status} />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {r.script?.name || "Deleted test"}
              {r.script?.folder ? <span className="ml-2 font-normal text-muted-foreground">{r.script.folder}</span> : null}
            </span>
          </button>
          {r.status === "Queued" && r.queuePosition != null && (
            <span className="text-xs text-amber-700">{r.queuePosition ? `${r.queuePosition} ahead` : "next"}</span>
          )}
          {results.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {results.length - failed}/{results.length} checks passed
            </span>
          )}
          {r.triggerSource && r.triggerSource !== "manual" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={r.triggeredByName ?? undefined}>
              {SOURCE_LABEL[r.triggerSource] ?? r.triggerSource}
            </span>
          )}
          {r.environment && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary" title="Environment">
              {r.environment}
            </span>
          )}
          <span className="w-16 text-right text-xs text-muted-foreground">{formatDuration(r.duration)}</span>
          <span className="w-36 text-right text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
          <span className="flex items-center gap-1">
            {isActive(r.status) ? (
              <button
                onClick={() => setPendingCancel({ ids: [r.id], label: r.script?.name ?? "this run" })}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-rose-700"
              >
                <Ban className="h-3 w-3" /> Cancel
              </button>
            ) : (
              <>
                {!nested && reportLinks(r.id)}
                {!notRerunnable(r.triggerSource) && (
                  <button
                    onClick={() => rerun(r.id, { rerunExecutionIds: [r.id] }, "Re-run")}
                    disabled={busy === r.id}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Run this test file again"
                  >
                    {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Re-run
                  </button>
                )}
              </>
            )}
          </span>
        </div>
        {open && detail && detail.id === r.id && (
          <div className="border-t bg-muted/60 p-4">
            <HubRunResults execution={detail} onOpenTrace={onOpenTrace} />
          </div>
        )}
      </div>
    )
  }

  const filtered = !!(debouncedQ || filters.status || filters.source || filters.from || filters.to)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search test or folder…"
            className="h-9 w-56 rounded-lg border bg-card pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters["status"] })}
          className="h-9 rounded-lg border bg-card px-2 text-sm"
          aria-label="Status"
        >
          <option value="">All results</option>
          <option value="Failed">Failed</option>
          <option value="Passed">Passed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value as Filters["source"] })}
          className="h-9 rounded-lg border bg-card px-2 text-sm"
          aria-label="Started by"
        >
          <option value="">Any trigger</option>
          <option value="manual">Manual</option>
          <option value="rerun">Re-run</option>
          <option value="schedule">Schedule</option>
          <option value="ci">CI</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          From
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="h-9 rounded-lg border bg-card px-2 text-sm text-foreground" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          to
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="h-9 rounded-lg border bg-card px-2 text-sm text-foreground" />
        </label>
        {filtered && (
          <button onClick={() => setFilters({ q: "", status: "", source: "", from: "", to: "" })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setCompareMode(!compareMode)
              setPicked([])
            }}
            title="Pick two runs to see what newly broke and what got fixed"
          >
            <GitCompareArrows className="mr-1.5 h-4 w-4" /> {compareMode ? "Done comparing" : "Compare"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTriggersOpen(!triggersOpen)}>
            <CalendarClock className="mr-1.5 h-4 w-4" /> Schedules & CI
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {triggersOpen && <HubAutomationTriggers projectId={projectId} onRunStarted={load} />}

      {compareMode && (
        <div className="rounded-xl border bg-card p-3 text-sm">
          {picked.length < 2 ? (
            <p className="text-muted-foreground">Tick two runs or batches below to compare them ({picked.length}/2 picked).</p>
          ) : !comparison ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Comparing…
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <CompareList title="Newly failing" tone="bad" items={comparison.newlyFailing} />
              <CompareList title="Fixed" tone="good" items={comparison.fixed} />
              <CompareList title="Still failing" tone="warn" items={comparison.stillFailing} />
              <p className="text-xs text-muted-foreground md:col-span-3">
                {comparison.stillPassing} still passing
                {comparison.added.length ? ` · ${comparison.added.length} only in the newer run` : ""}
                {comparison.removed.length ? ` · ${comparison.removed.length} only in the older run` : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <History className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 font-medium text-foreground">{filtered ? "No runs match these filters" : "No runs yet"}</p>
          <p className="text-sm text-muted-foreground">Run a test, a folder or everything from the Tests tab — or set up a schedule.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {groups.map((g, gi) => {
            if (!g.batchId) return <div key={g.key} className={gi ? "border-t" : ""}>{row(g.runs[0])}</div>
            const status = groupStatus(g.runs)
            const active = g.runs.filter((r) => isActive(r.status))
            const failedCount = g.runs.filter((r) => r.status === "Failed").length
            const first = g.runs[g.runs.length - 1]
            return (
              <div key={g.key} className={gi ? "border-t" : ""}>
                <div className="flex flex-wrap items-center gap-3 bg-muted/50 px-4 py-2 text-sm">
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={picked.includes(g.key)}
                      onChange={() => togglePick(g.key)}
                      aria-label="Pick batch for comparison"
                      className="accent-[hsl(var(--primary))]"
                    />
                  )}
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <StatusBadge status={status} />
                  <span className="font-medium text-foreground">
                    {g.runs.length} tests run together
                    {(() => {
                      const folders = [...new Set(g.runs.map((r) => r.script?.folder || ""))]
                      return folders.length === 1 && folders[0] ? ` · ${folders[0]}` : ""
                    })()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.runs.filter((r) => r.status === "Passed").length} passed, {failedCount} failed
                  </span>
                  {first.triggerSource && first.triggerSource !== "manual" && (
                    <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground" title={first.triggeredByName ?? undefined}>
                      {SOURCE_LABEL[first.triggerSource] ?? first.triggerSource}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {active.length > 0 ? (
                      <button
                        onClick={() => setPendingCancel({ ids: active.map((r) => r.id), label: `${active.length} unfinished runs in this batch` })}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-card hover:text-rose-700"
                      >
                        <Ban className="h-3 w-3" /> Cancel batch
                      </button>
                    ) : (
                      <>
                        {failedCount > 0 && !notRerunnable(first.triggerSource) && (
                          <button
                            onClick={() => rerun(g.key, { rerunFailedOfBatch: g.batchId }, "Re-running failed tests")}
                            disabled={busy === g.key}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-rose-700 hover:bg-card disabled:opacity-50"
                          >
                            {busy === g.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Re-run {failedCount} failed
                          </button>
                        )}
                        {reportLinks(g.key)}
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(first.createdAt).toLocaleString()}</span>
                  </span>
                </div>
                {g.runs.map((r) => row(r, true))}
              </div>
            )
          })}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Load more
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingCancel !== null}
        variant="danger"
        title="Cancel run?"
        description={`Stops ${pendingCancel?.label}. Queued runs are skipped; a running test is stopped where it is.`}
        confirmLabel="Cancel run"
        onConfirm={async () => {
          if (pendingCancel) await cancel(pendingCancel.ids)
          setPendingCancel(null)
        }}
        onCancel={() => setPendingCancel(null)}
      />
    </div>
  )
}

function CompareList({ title, items, tone }: { title: string; items: string[]; tone: "bad" | "good" | "warn" }) {
  const color = tone === "bad" ? "text-rose-700" : tone === "good" ? "text-emerald-700" : "text-amber-700"
  return (
    <div>
      <p className={cn("text-xs font-semibold", color)}>
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
          {items.map((t) => (
            <li key={t} className="truncate" title={t}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
