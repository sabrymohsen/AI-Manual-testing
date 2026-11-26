"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import {
  Route,
  Download,
  Loader2,
  Globe,
  MousePointerClick,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Terminal,
  Activity,
  Eye,
  Camera,
  Code2,
  ChevronRight,
  X,
  FolderOpen,
  Zap,
  ArrowUpRight
} from "@/components/ui/icons"

// ---------- Types ----------

interface TraceSummary {
  id: string
  className: string
  methodName: string
  displayName: string
  status: string
  generatedAt: string | null
  actionCount: number
}

interface TraceAction {
  id: string
  category: string
  name: string
  status: string
  startTime: string
  durationMs: number
  locator: string
  url: string
  message: string
  exception: { type: string; message: string }
  attachments: string[]
  metadata: Record<string, any>
}

interface ConsoleMsg {
  source: string
  level: string
  message: string
  timestamp: number
}

interface NetworkEntry {
  id: string
  startedDateTime: string | null
  method: string
  url: string
  status: number | null
  statusText: string
  durationMs: number | null
  size: number | null
  mimeType: string
  request: any
  response: any
}

interface TraceEvidence {
  id: string
  stepNumber: number
  fileType: string
  createdAt: string
  fileExists: boolean
}

interface TraceData {
  id: string
  generatedAt: string | null
  test: { className: string; methodName: string; displayName: string; description: string; status: string } | null
  exception: { type: string; message: string; stacktrace: string } | null
  source: { frame: string; file: string; line: string; snippet: string } | null
  locatorHealth: { enabled: boolean } | null
  browserObservability: { warnings: any[] }
  actions: TraceAction[]
  console: ConsoleMsg[]
  network: NetworkEntry[]
  attachments: string[]
  executionId: string | null
  evidence: TraceEvidence[]
}

// ---------- Helpers ----------

const ACTION_ICON: Record<string, any> = {
  browser: Globe,
  navigation: Globe,
  element: MousePointerClick,
  validation: ClipboardCheck,
  wait: Clock,
  assertion: ClipboardCheck
}

function actionIcon(a: TraceAction) {
  return ACTION_ICON[a.category] || ACTION_ICON[a.metadata?.checkpointType] || Zap
}

const STATUS_CLASS: Record<string, string> = {
  passed: "bg-emerald-500",
  failed: "bg-rose-500",
  skipped: "bg-slate-400",
  broken: "bg-amber-500"
}

function statusBadgeClass(status: string): string {
  const s = (status || "").toLowerCase()
  if (s === "passed") return "bg-emerald-50 text-emerald-700 border-emerald-100"
  if (s === "failed") return "bg-rose-50 text-rose-700 border-rose-100"
  if (s === "broken") return "bg-amber-50 text-amber-700 border-amber-100"
  return "bg-muted/50 text-muted-foreground border-border"
}

function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Console level → semantic colour (SHAFT uses java.util.logging level names)
function consoleLevel(level: string): { label: string; className: string } {
  const l = (level || "").toUpperCase()
  if (l === "SEVERE" || l === "ERROR") return { label: "error", className: "text-rose-300 border-rose-500/40 bg-rose-500/10" }
  if (l === "WARNING" || l === "WARN") return { label: "warn", className: "text-amber-300 border-amber-500/40 bg-amber-500/10" }
  if (l === "INFO") return { label: "info", className: "text-sky-300 border-sky-500/40 bg-sky-500/10" }
  return { label: "log", className: "text-slate-300 border-slate-500/40 bg-slate-500/10" }
}

// Extract a "file:line" hint from a console message if present
function sourceHint(msg: string): string | null {
  const m = msg.match(/([\w.\-/]+\.(?:js|mjs|ts|jsx|tsx|html)):(\d+)(?::(\d+))?/) || msg.match(/console-api\s+(\d+):(\d+)/)
  return m ? m[0] : null
}

// ---------- Component ----------

export default function TraceViewerSection({
  onOpenEvidence,
  initialTraceId,
}: {
  onOpenEvidence?: (evidenceId: string) => void
  /** Open this trace first (a test's "Open trace" button in a run's results). */
  initialTraceId?: string | null
}) {
  const [traces, setTraces] = useState<TraceSummary[]>([])
  const [selectedId, setSelectedId] = useState(initialTraceId || "")
  const [data, setData] = useState<TraceData | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [traceLoading, setTraceLoading] = useState(false)
  const [subTab, setSubTab] = useState<"timeline" | "network" | "console" | "observability">("timeline")
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [netOpenId, setNetOpenId] = useState<string | null>(null)

  // Load available traces
  useEffect(() => {
    fetch("/api/hub/traces")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: TraceSummary[] = d?.traces || []
        setTraces(list)
        if (list.length > 0) setSelectedId((cur) => cur || list[0].id)
      })
      .catch(() => {})
      .finally(() => setListLoading(false))
  }, [])

  // Load selected trace
  useEffect(() => {
    if (!selectedId) return
    setTraceLoading(true)
    setSelectedActionId(null)
    setNetOpenId(null)
    fetch(`/api/hub/traces/${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TraceData | null) => {
        setData(d)
        // auto-select the failing action, else the first
        if (d?.actions?.length) {
          const failing = d.actions.find((a) => a.status === "failed")
          setSelectedActionId((failing || d.actions[0]).id)
        }
      })
      .catch(() => setData(null))
      .finally(() => setTraceLoading(false))
  }, [selectedId])

  const screenshots = useMemo(
    () => (data?.evidence || []).filter((e) => (e.fileType === "screenshot" || e.fileType === "gif") && e.fileExists),
    [data]
  )
  const actionsWithShots = useMemo(
    () => (data?.actions || []).filter((a) => (a.attachments || []).some((x) => /screenshot/i.test(x))),
    [data]
  )

  const screenshotForAction = useCallback(
    (action: TraceAction): TraceEvidence | null => {
      const hasShot = (action.attachments || []).some((x) => /screenshot/i.test(x))
      if (!hasShot || screenshots.length === 0) return null
      const idx = actionsWithShots.findIndex((a) => a.id === action.id)
      const pick = idx < 0 ? screenshots.length - 1 : Math.min(idx, screenshots.length - 1)
      return screenshots[pick] || screenshots[screenshots.length - 1] || null
    },
    [screenshots, actionsWithShots]
  )

  const selectedAction = useMemo(
    () => data?.actions.find((a) => a.id === selectedActionId) || null,
    [data, selectedActionId]
  )

  const maxDur = useMemo(() => Math.max(1, ...(data?.actions || []).map((a) => a.durationMs || 0)), [data])
  const totalDur = useMemo(() => (data?.actions || []).reduce((s, a) => s + (a.durationMs || 0), 0), [data])

  const SUB_TABS = [
    { id: "timeline" as const, label: "Timeline", icon: Activity, count: data?.actions.length },
    { id: "network" as const, label: "Network", icon: Globe, count: data?.network.length },
    { id: "console" as const, label: "Console", icon: Terminal, count: data?.console.length },
    { id: "observability" as const, label: "Browser Observability", icon: Eye, count: data?.browserObservability?.warnings?.length }
  ]

  // ---------- Render ----------

  if (listLoading) {
    return (
      <div className="py-24 flex justify-center bg-card border rounded-xl">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (traces.length === 0) {
    return (
      <div className="py-20 text-center bg-card border rounded-xl space-y-2">
        <Route size={26} className="text-slate-300 mx-auto" />
        <p className="text-xs font-medium text-muted-foreground">No trace bundles yet</p>
        <p className="text-xs text-muted-foreground font-medium">
          Every run saves a Playwright <span className="font-mono">trace.zip</span> per test. Run a test in the Tests tab to
          populate the Trace Viewer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* HEADER: execution selector + download */}
      <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-2 flex-wrap">
        <Route size={15} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Trace Viewer</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold cursor-pointer min-w-[320px]"
        >
          {traces.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName || t.methodName} — {t.status} · {t.actionCount} actions
              {t.generatedAt ? ` · ${new Date(t.generatedAt).toLocaleString()}` : ""}
            </option>
          ))}
        </select>

        {data?.test && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase px-2 py-0.5 text-xs ${statusBadgeClass(
              data.test.status
            )}`}
          >
            {data.test.status === "passed" ? (
              <CheckCircle2 size={10} />
            ) : data.test.status === "failed" ? (
              <XCircle size={10} />
            ) : (
              <AlertTriangle size={10} />
            )}
            {data.test.status}
          </span>
        )}

        <a
          href={`/api/hub/traces/${encodeURIComponent(selectedId)}/download`}
          className="ml-auto inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 text-xs font-semibold"
        >
          <Download size={12} /> Download Trace
        </a>
      </div>

      {traceLoading ? (
        <div className="py-24 flex justify-center bg-card border rounded-xl">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : !data ? (
        <div className="py-20 text-center bg-card border rounded-xl text-muted-foreground text-xs font-medium">
          Could not read this trace bundle.
        </div>
      ) : (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {/* Test meta + failure banner */}
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-foreground">
                {data.test?.className?.split(".").pop()}.{data.test?.methodName}
              </span>
              {data.test?.description && (
                <span className="text-xs text-muted-foreground font-medium truncate max-w-[420px]">
                  {data.test.description}
                </span>
              )}
              {data.locatorHealth?.enabled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/25 px-2 py-0.5 text-xs font-medium">
                  <Zap size={9} /> Smart Locator
                </span>
              )}
            </div>
            {data.exception && data.exception.type && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                <p className="text-xs font-medium text-rose-600 flex items-center gap-1">
                  <XCircle size={11} /> {data.exception.type}
                </p>
                <p className="text-xs text-rose-700 font-medium mt-0.5 whitespace-pre-wrap break-words line-clamp-3">
                  {data.exception.message}
                </p>
              </div>
            )}
          </div>

          {/* Sub-tab bar */}
          <div className="flex items-center gap-1 px-3 pt-3 border-b">
            {SUB_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-t-xl text-xs font-semibold transition-all border-b-2 -mb-px ${
                  subTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon size={12} /> {t.label}
                {typeof t.count === "number" && (
                  <span
                    className={`text-xs rounded-full px-2 py-px font-semibold ${
                      subTab === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* ============ TIMELINE ============ */}
            {subTab === "timeline" && (
              <div className="space-y-4">
                {data.actions.length === 0 ? (
                  <EmptyState icon={Activity} text="No actions recorded in this trace" />
                ) : (
                  <>
                    {/* Ruler */}
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>Action Timeline · width ∝ duration</span>
                      <span className="font-mono">Σ {fmtMs(totalDur)}</span>
                    </div>

                    {/* Horizontal action bars */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {data.actions.map((a, i) => {
                        const Icon = actionIcon(a)
                        const width = Math.max(96, Math.round(((a.durationMs || 0) / maxDur) * 240))
                        const active = a.id === selectedActionId
                        return (
                          <button
                            key={a.id}
                            onClick={() => setSelectedActionId(a.id)}
                            style={{ width }}
                            className={`shrink-0 text-left rounded-xl border p-2 transition-all ${
                              active ? "ring-2 ring-primary border-primary/25 bg-primary/10" : "hover:border-border bg-card"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${STATUS_CLASS[a.status] || "bg-slate-400"}`} />
                              <Icon size={11} className="text-muted-foreground shrink-0" />
                              <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                            </div>
                            <p className="text-xs font-semibold text-foreground truncate mt-1">{a.name}</p>
                            <p className="text-xs font-mono font-semibold text-muted-foreground mt-0.5">{fmtMs(a.durationMs)}</p>
                          </button>
                        )
                      })}
                    </div>

                    {/* Action detail panel */}
                    {selectedAction && (
                      <ActionDetail
                        action={selectedAction}
                        smartLocator={Boolean(data.locatorHealth?.enabled)}
                        source={data.source}
                        evidence={screenshotForAction(selectedAction)}
                        onOpenEvidence={onOpenEvidence}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* ============ NETWORK ============ */}
            {subTab === "network" && (
              <div className="space-y-2">
                {data.network.length === 0 ? (
                  <EmptyState icon={Globe} text="No network requests captured in this trace's HAR" />
                ) : (
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-xs font-medium">
                          <th className="text-left px-3 py-2">Time</th>
                          <th className="text-left px-2 py-2">Method</th>
                          <th className="text-left px-2 py-2">URL</th>
                          <th className="text-left px-2 py-2">Status</th>
                          <th className="text-right px-2 py-2">Duration</th>
                          <th className="text-right px-3 py-2">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.network.map((n) => (
                          <Fragment key={n.id}>
                            <tr
                              onClick={() => setNetOpenId(netOpenId === n.id ? null : n.id)}
                              className="border-t hover:bg-primary/10 cursor-pointer"
                            >
                              <td className="px-3 py-2 font-mono text-muted-foreground">
                                {n.startedDateTime ? new Date(n.startedDateTime).toLocaleTimeString() : "—"}
                              </td>
                              <td className="px-2 py-2 font-mono font-semibold text-primary">{n.method || "—"}</td>
                              <td className="px-2 py-2 font-mono text-muted-foreground truncate max-w-[280px]">{n.url}</td>
                              <td className="px-2 py-2">
                                <span
                                  className={`font-mono font-semibold ${
                                    n.status === null ? "text-muted-foreground" : n.status < 400 ? "text-emerald-600" : "text-rose-600"
                                  }`}
                                >
                                  {n.status ?? "—"}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-amber-600 font-semibold">{fmtMs(n.durationMs)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmtBytes(n.size)}</td>
                            </tr>
                            {netOpenId === n.id && (
                              <tr className="border-t bg-slate-950">
                                <td colSpan={6} className="p-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <NetPanel title="Request" data={n.request} />
                                    <NetPanel title="Response" data={n.response} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ============ CONSOLE ============ */}
            {subTab === "console" && (
              <div>
                {data.console.length === 0 ? (
                  <EmptyState icon={Terminal} text="No browser console messages captured" />
                ) : (
                  <div className="bg-slate-950 rounded-xl p-3 font-mono text-xs leading-relaxed max-h-[54vh] overflow-auto space-y-1">
                    {data.console.map((c, i) => {
                      const lvl = consoleLevel(c.level)
                      const hint = sourceHint(c.message)
                      return (
                        <div key={i} className="flex gap-2 items-start hover:bg-white/5 px-1 -mx-1 rounded py-0.5">
                          <span className={`shrink-0 rounded border px-2 py-px text-xs font-semibold uppercase ${lvl.className}`}>
                            {lvl.label}
                          </span>
                          <span className="shrink-0 text-xs font-medium text-muted-foreground pt-0.5">{c.source}</span>
                          <span className="flex-1 text-slate-200 break-all whitespace-pre-wrap">{c.message}</span>
                          {hint && <span className="shrink-0 text-xs font-mono text-purple-300 pt-0.5">{hint}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ============ BROWSER OBSERVABILITY ============ */}
            {subTab === "observability" && (
              <div>
                {(data.browserObservability?.warnings?.length || 0) === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <CheckCircle2 size={24} className="text-emerald-400 mx-auto" />
                    <p className="text-xs font-medium text-muted-foreground">Full observability</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      No unsupported-capability warnings — this browser exposed every signal the trace records.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.browserObservability.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-xs font-medium text-amber-800 break-words">
                          {typeof w === "string" ? w : w.message || JSON.stringify(w)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Sub-components ----------

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <Icon size={22} />
      <span className="text-xs uppercase font-semibold tracking-wider">{text}</span>
    </div>
  )
}

function ActionDetail({
  action,
  smartLocator,
  source,
  evidence,
  onOpenEvidence
}: {
  action: TraceAction
  smartLocator: boolean
  source: TraceData["source"]
  evidence: TraceEvidence | null
  onOpenEvidence?: (id: string) => void
}) {
  const failed = action.status === "failed"
  const Icon = actionIcon(action)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 border-t pt-4">
      {/* Meta */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${failed ? "bg-rose-100 text-rose-600" : "bg-primary/15 text-primary"}`}>
            <Icon size={15} />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">{action.name}</p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{action.category}</p>
          </div>
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded-full border font-semibold uppercase px-2 py-0.5 text-xs ${statusBadgeClass(
              action.status
            )}`}
          >
            {action.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs font-semibold text-muted-foreground bg-muted/50 border rounded-xl p-3">
          <div>
            <span className="text-muted-foreground text-xs block">Duration</span>
            <span className="font-mono">{fmtMs(action.durationMs)}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs block">Started</span>
            <span className="font-mono">{action.startTime ? new Date(action.startTime).toLocaleTimeString() : "—"}</span>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground text-xs block flex items-center gap-1">
              Locator
              {smartLocator && action.locator && (
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 text-primary px-1 text-xs font-semibold uppercase">
                  <Zap size={7} /> Smart
                </span>
              )}
            </span>
            <span className="font-mono break-all text-primary">{action.locator || "— (no element locator)"}</span>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground text-xs block">Page URL</span>
            <span className="font-mono break-all">{action.url || "—"}</span>
          </div>
          {action.message && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs block">Message</span>
              <span className="break-words">{action.message}</span>
            </div>
          )}
        </div>

        {failed && action.exception?.type && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
            <p className="text-xs font-medium text-rose-600 flex items-center gap-1">
              <XCircle size={11} /> {action.exception.type}
            </p>
            <p className="text-xs text-rose-700 font-medium break-words">{action.exception.message}</p>
          </div>
        )}

        {failed && source?.snippet && (
          <div className="bg-slate-950 rounded-xl p-3 overflow-x-auto">
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Code2 size={10} /> {source.file}:{source.line}
            </p>
            <pre className="font-mono text-xs leading-relaxed text-slate-200 whitespace-pre">{source.snippet}</pre>
          </div>
        )}
      </div>

      {/* Screenshot at this moment */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Camera size={10} /> Screenshot at this step
        </span>
        {evidence ? (
          <button
            onClick={() => onOpenEvidence?.(evidence.id)}
            className="group relative block w-full rounded-xl overflow-hidden border bg-slate-950 hover:ring-2 hover:ring-indigo-400 transition-all"
            title="Open in Evidence Vault"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/hub/evidence/${evidence.id}/file`} alt="step screenshot" className="w-full object-contain max-h-52" />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 bg-black/70 text-white text-xs font-medium rounded-md px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowUpRight size={9} /> Evidence Vault
            </span>
          </button>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center gap-2 bg-muted/50 border rounded-xl text-slate-300">
            <FolderOpen size={16} />
            <span className="text-xs font-medium">No screenshot at this step</span>
          </div>
        )}
        {onOpenEvidence && evidence && (
          <button
            onClick={() => onOpenEvidence(evidence.id)}
            className="w-full inline-flex items-center justify-center gap-2 h-8 rounded-xl border border-primary/25 bg-primary/10 text-primary hover:bg-primary/10 text-xs font-semibold"
          >
            <ChevronRight size={11} /> Highlight in Evidence Vault
          </button>
        )}
      </div>
    </div>
  )
}

function NetPanel({ title, data }: { title: string; data: any }) {
  const headers: any[] = data?.headers || []
  const body = data?.postData?.text || data?.content?.text || ""
  return (
    <div className="space-y-2 overflow-hidden">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{title}</span>
      {headers.length > 0 && (
        <div className="space-y-0.5 max-h-32 overflow-auto">
          {headers.slice(0, 24).map((h, i) => (
            <p key={i} className="font-mono text-xs text-slate-300 break-all">
              <span className="text-indigo-300">{h.name}</span>: {h.value}
            </p>
          ))}
        </div>
      )}
      {body ? (
        <pre className="font-mono text-xs text-emerald-300 leading-relaxed overflow-auto max-h-32 whitespace-pre-wrap break-all">
          {String(body).slice(0, 2000)}
        </pre>
      ) : headers.length === 0 ? (
        <p className="text-xs text-muted-foreground ">No {title.toLowerCase()} data</p>
      ) : null}
    </div>
  )
}
