"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertTriangle, ArrowLeft, Bug, Loader2, MinusCircle, PlusCircle, Square } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  RunStatusBadge,
  SCREEN_STATUS_META,
  ScreenStatusBadge,
  TEST_TYPE_LABEL,
  api,
  formatDate,
  formatDuration,
  pathOf,
  type ScreenStatus,
} from "@/components/visual-tests/shared"

type Tab = "summary" | "screens" | "issues"

export default function VisualRunPage() {
  const { id: projectId, runId } = useParams() as { id: string; runId: string }
  const [data, setData] = useState<{ run: any; screens: any[] } | null>(null)
  const [tab, setTab] = useState<Tab>("summary")
  const [statusFilter, setStatusFilter] = useState<ScreenStatus | "all">("all")
  const [envFilter, setEnvFilter] = useState<string>("all")
  const [stopping, setStopping] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/visual-tests/runs/${runId}`))
    } catch (err: any) {
      toast.error(err.message)
    }
  }, [runId])
  useEffect(() => {
    load()
  }, [load])

  const live = data && (data.run.status === "Queued" || data.run.status === "Running")
  useEffect(() => {
    if (!live) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [live, load])

  // Land on what needs attention once a run has finished.
  useEffect(() => {
    if (data && !live && tab === "summary" && data.run.unresolvedCount > 0 && sessionStorageSafeGet(`vt-run-seen-${runId}`) !== "1") {
      sessionStorageSafeSet(`vt-run-seen-${runId}`, "1")
      setStatusFilter("Unresolved")
      setTab("screens")
    }
  }, [data, live, tab, runId])

  const screens = useMemo(() => data?.screens ?? [], [data])
  const filtered = useMemo(
    () => screens.filter(s => (statusFilter === "all" || s.status === statusFilter) && (envFilter === "all" || s.envKey === envFilter)),
    [screens, statusFilter, envFilter]
  )

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }
  const { run } = data
  const test = run.visualTest
  const errors = screens.filter(s => s.status === "Error")
  const removed = screens.filter(s => s.diffState === "Removed")
  const added = screens.filter(s => s.diffState === "Added" && s.status !== "Error")
  const unresolved = screens.filter(s => s.status === "Unresolved")
  const queuedFor = run.status === "Queued" ? Date.now() - new Date(run.createdAt).getTime() : 0
  const pct = run.totalScreens ? Math.round((run.doneScreens / run.totalScreens) * 100) : 0
  const countBy = (st: ScreenStatus) => screens.filter(s => s.status === st).length

  const stop = async () => {
    setStopping(true)
    try {
      await api(`/api/visual-tests/runs/${runId}/cancel`, { method: "POST" })
      toast.success("Stopping after the pages already open")
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <Link href={`/projects/${projectId}/visual-tests/${test.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {test.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-foreground">
            {test.name} <RunStatusBadge status={run.status} outcome={run.outcome} newCount={run.newCount} passedCount={run.passedCount} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {TEST_TYPE_LABEL[test.type]} · started {formatDate(run.startedAt || run.createdAt)} · took {formatDuration(run.startedAt, run.completedAt)}
          </p>
        </div>
        {live && (
          <Button variant="outline" onClick={stop} disabled={stopping}>
            {stopping ? <Loader2 className="animate-spin" /> : <Square />} Stop
          </Button>
        )}
      </div>

      {/* Whose turn is it — always said in words. */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          live ? "border-primary/25 bg-primary/10 text-primary" : run.unresolvedCount > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : run.outcome === "Failed" || run.status === "Failed" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {run.status === "Queued" ? (
          queuedFor > 30_000 ? (
            "Still waiting to start. The background worker that takes the screenshots may not be running (npm run workers)."
          ) : (
            "Waiting for the worker to pick this run up…"
          )
        ) : run.status === "Running" ? (
          <div className="space-y-2">
            <p>
              Capturing screenshots: {run.doneScreens} of {run.totalScreens || "?"}. You can leave this page; the run continues.
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : run.status === "Failed" && !run.outcome ? (
          `The run could not finish: ${run.error || "unknown error"}`
        ) : run.unresolvedCount > 0 ? (
          `Your turn: ${run.unresolvedCount} screen(s) look different from the approved screenshots. Open each one and accept or reject it.`
        ) : run.outcome === "Failed" ? (
          `Done. ${run.failedCount} screen(s) failed — pages that did not load, or changes marked as defects.`
        ) : run.status === "Cancelled" ? (
          "This run was stopped. Screens captured before stopping are below."
        ) : (
          "Nothing to do: every screen matches its approved screenshot."
        )}
        {!live && run.error && run.outcome && <p className="mt-1 text-xs opacity-80">{run.error}</p>}
      </div>

      <div className="flex gap-1 border-b">
        {(
          [
            ["summary", "Summary"],
            ["screens", `Screens (${screens.length})`],
            ["issues", `Issues & changes (${errors.length + removed.length + added.length + unresolved.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-1">
            <h2 className="font-semibold text-foreground">Screens</h2>
            {(["Unresolved", "Error", "Rejected", "Passed", "Accepted", "New", "Removed"] as ScreenStatus[]).map(st => (
              <button
                key={st}
                disabled={!countBy(st)}
                onClick={() => {
                  setStatusFilter(st)
                  setTab("screens")
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
              >
                <ScreenStatusBadge status={st} />
                <span className="font-semibold text-foreground">{countBy(st)}</span>
              </button>
            ))}
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-2">
            <h2 className="font-semibold text-foreground">By browser &amp; screen size</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Environment</th>
                  <th className="py-2">Passed</th>
                  <th className="py-2">To review</th>
                  <th className="py-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {run.environments.map((e: any) => {
                  const mine = screens.filter(s => s.envKey === e.key)
                  return (
                    <tr key={e.key} className="border-t">
                      <td className="py-2">
                        <button className="text-left hover:text-primary" onClick={() => { setEnvFilter(e.key); setStatusFilter("all"); setTab("screens") }}>
                          {e.name} <span className="text-xs text-muted-foreground">{e.width}×{e.height}</span>
                        </button>
                      </td>
                      <td className="py-2 text-emerald-700">{mine.filter(s => ["Passed", "Accepted", "New"].includes(s.status)).length}</td>
                      <td className="py-2 text-amber-700">{mine.filter(s => s.status === "Unresolved" || s.status === "Removed").length}</td>
                      <td className="py-2 text-rose-700">{mine.filter(s => s.status === "Error" || s.status === "Rejected").length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-3 pt-2 text-sm sm:grid-cols-4">
              <Stat label="Pages checked" value={new Set(screens.filter(s => s.diffState !== "Removed").map(s => s.screenKey)).size} />
              <Stat label="New pages" value={run.addedPages} />
              <Stat label="Removed pages" value={run.removedPages} />
              <Stat label="Comparison" value={run.matchLevel === "Strict" ? "Exact" : run.matchLevel === "Dynamic" ? "Changing text ignored" : "Colours ignored"} />
            </div>
          </div>
        </div>
      )}

      {tab === "screens" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="h-9 rounded-md border bg-card px-2">
              <option value="all">All results</option>
              {(Object.keys(SCREEN_STATUS_META) as ScreenStatus[]).map(st => (
                <option key={st} value={st}>
                  {SCREEN_STATUS_META[st].label} ({countBy(st)})
                </option>
              ))}
            </select>
            <select value={envFilter} onChange={e => setEnvFilter(e.target.value)} className="h-9 rounded-md border bg-card px-2">
              <option value="all">All browsers &amp; sizes</option>
              {run.environments.map((e: any) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">{filtered.length} shown</span>
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{live ? "Screens appear here as they are captured." : "No screens match."}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(s => (
                <Link key={s.id} href={`/projects/${projectId}/visual-tests/screens/${s.id}`} className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary hover:shadow">
                  <div className="relative h-44 overflow-hidden bg-muted">
                    {s.hasActual ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/visual-tests/screens/${s.id}/image?kind=${s.hasDiff && s.status === "Unresolved" ? "diff" : "actual"}`} alt="" loading="lazy" className="w-full object-cover object-top" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        {s.status === "Removed" ? <MinusCircle className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
                      </div>
                    )}
                    <span className="absolute left-2 top-2">
                      <ScreenStatusBadge status={s.status} auto={s.resolvedByAuto} />
                    </span>
                    {s.bugReportId && (
                      <span className="absolute right-2 top-2 rounded-full bg-rose-600 p-1 text-white" title="A bug was filed">
                        <Bug className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="truncate text-sm font-medium text-foreground" title={s.url || s.name}>
                      {s.url ? pathOf(s.url) : s.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.envName} · {s.viewport}
                      {s.status === "Unresolved" && s.regionCount ? ` · ${s.regionCount} change${s.regionCount === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "issues" && (
        <div className="space-y-4">
          <IssueList title="Pages that did not load" icon={<AlertTriangle className="h-4 w-4 text-rose-600" />} projectId={projectId} rows={errors} detail={s => s.errorMessage} empty="Every page loaded." />
          <IssueList title="Look different — waiting for review" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} projectId={projectId} rows={unresolved} detail={s => `${s.regionCount} changed area(s), ${(s.mismatchPercent ?? 0).toFixed(2)}% of the page`} empty="Nothing waiting." />
          <IssueList title="New pages (first screenshot recorded)" icon={<PlusCircle className="h-4 w-4 text-sky-600" />} projectId={projectId} rows={added} detail={() => "Recorded as the approved screenshot"} empty="No new pages." />
          <IssueList title="Removed from the sitemap" icon={<MinusCircle className="h-4 w-4 text-muted-foreground" />} projectId={projectId} rows={removed} detail={s => (s.status === "Removed" ? "Accept if it was meant to go, reject if it should still exist" : SCREEN_STATUS_META[s.status as ScreenStatus].label)} empty="No pages were removed." />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  )
}

function IssueList({ title, icon, rows, detail, empty, projectId }: { title: string; icon: React.ReactNode; rows: any[]; detail: (_s: any) => string; empty: string; projectId: string }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold text-foreground">
        {icon} {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        rows.map(s => (
          <Link key={s.id} href={`/projects/${projectId}/visual-tests/screens/${s.id}`} className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-0 hover:bg-muted/50">
            <span className="w-64 truncate font-medium text-foreground">{s.url ? pathOf(s.url) : s.name}</span>
            <span className="w-44 text-xs text-muted-foreground">{s.envName}</span>
            <span className="flex-1 truncate text-muted-foreground">{detail(s)}</span>
            <ScreenStatusBadge status={s.status} auto={s.resolvedByAuto} />
          </Link>
        ))
      )}
    </div>
  )
}

function sessionStorageSafeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}
function sessionStorageSafeSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {}
}
