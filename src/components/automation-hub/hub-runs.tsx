"use client"

/**
 * Automation Hub → Runs: every run in the project, newest first. Runs started
 * together (Run folder / Run all) are grouped. Click one to see its results.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { History, Layers, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import HubRunResults, { StatusBadge, formatDuration, isActive, type HubExecutionView } from "@/components/automation-hub/hub-run-results"

interface RunRow extends HubExecutionView {
  batchId: string | null
  executionTarget: string | null
}

type Group = { key: string; batchId: string | null; runs: RunRow[] }

const groupStatus = (runs: RunRow[]) =>
  runs.some((r) => isActive(r.status)) ? (runs.some((r) => r.status === "Running") ? "Running" : "Queued") : runs.some((r) => r.status === "Failed") ? "Failed" : "Passed"

export default function HubRunsSection({ projectId, onOpenTrace }: { projectId: string; onOpenTrace: (traceId: string) => void }) {
  const [runs, setRuns] = useState<RunRow[] | null>(null)
  const [filter, setFilter] = useState<"all" | "Failed" | "Passed">("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<HubExecutionView | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/hub/runs?projectId=${projectId}&limit=100`)
    const d = await res.json().catch(() => ({}))
    setRuns(d.runs || [])
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

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
      if (filter !== "all" && r.status !== filter) continue
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
  }, [runs, filter])

  if (runs === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-white p-10 text-sm text-slate-500">
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
        <button
          type="button"
          onClick={() => setOpenId(open ? null : r.id)}
          className={`flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${nested ? "pl-10" : ""} ${open ? "bg-indigo-50/50" : ""}`}
        >
          <StatusBadge status={r.status} />
          <span className="min-w-[160px] flex-1 truncate font-medium text-slate-800">
            {r.script?.name || "Deleted test"}
            {r.script?.folder ? <span className="ml-2 font-normal text-slate-400">{r.script.folder}</span> : null}
          </span>
          {results.length > 0 && (
            <span className="text-xs text-slate-500">
              {results.length - failed}/{results.length} checks passed
            </span>
          )}
          <span className="w-20 text-right text-xs text-slate-400">{formatDuration(r.duration)}</span>
          <span className="w-24 truncate text-xs text-slate-400">{r.browser}</span>
          <span className="w-40 text-right text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
        </button>
        {open && detail && detail.id === r.id && (
          <div className="border-t bg-slate-50/60 p-4">
            <HubRunResults execution={detail} onOpenTrace={onOpenTrace} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white p-0.5 text-sm">
          {(["all", "Failed", "Passed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 ${filter === f ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center">
          <History className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 font-medium text-slate-800">{runs.length ? "No runs match this filter" : "No runs yet"}</p>
          <p className="text-sm text-slate-500">Run a test, a folder or everything from the Tests tab.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          {groups.map((g, gi) =>
            g.batchId ? (
              <div key={g.key} className={gi ? "border-t" : ""}>
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-4 py-2 text-sm">
                  <Layers className="h-4 w-4 text-slate-400" />
                  <StatusBadge status={groupStatus(g.runs)} />
                  <span className="font-medium text-slate-700">
                    {g.runs.length} tests run together
                    {(() => {
                      const folders = [...new Set(g.runs.map((r) => r.script?.folder || ""))]
                      return folders.length === 1 && folders[0] ? ` · ${folders[0]}` : ""
                    })()}
                  </span>
                  <span className="text-xs text-slate-500">
                    {g.runs.filter((r) => r.status === "Passed").length} passed, {g.runs.filter((r) => r.status === "Failed").length} failed
                  </span>
                  <span className="ml-auto text-xs text-slate-400">{new Date(g.runs[g.runs.length - 1].createdAt).toLocaleString()}</span>
                </div>
                {g.runs.map((r) => row(r, true))}
              </div>
            ) : (
              <div key={g.key} className={gi ? "border-t" : ""}>
                {row(g.runs[0])}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
