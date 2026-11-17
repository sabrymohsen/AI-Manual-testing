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
} from "lucide-react"

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
  return "bg-slate-50 text-slate-600 border-slate-200"
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
      <div className="py-24 flex justify-center bg-white border rounded-2xl">
        <Loader2 size={24} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  if (traces.length === 0) {
    return (
      <div className="py-20 text-center bg-white border rounded-2xl space-y-2">
        <Route size={26} className="text-slate-300 mx-auto" />
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No trace bundles yet</p>
        <p className="text-[9.5px] text-slate-400 font-medium">
          Every run saves a Playwright <span className="font-mono">trace.zip</span> per test. Run a test in the Tests tab to
          populate the Trace Viewer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* HEADER: execution selector + download */}
      <div className="bg-white border rounded-2xl p-3 shadow-sm flex items-center gap-2 flex-wrap">
        <Route size={15} className="text-indigo-600" />
        <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Trace Viewer</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-9 rounded-xl border px-2.5 text-[10px] bg-slate-50 font-bold cursor-pointer min-w-[320px]"
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
            className={`inline-flex items-center gap-1 rounded-full border font-black uppercase px-2 py-0.5 text-[9px] ${statusBadgeClass(
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
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[10px] font-black"
        >
          <Download size={12} /> Download Trace
        </a>
      </div>

      {traceLoading ? (
        <div className="py-24 flex justify-center bg-white border rounded-2xl">
          <Loader2 size={22} className="animate-spin text-indigo-600" />
        </div>
      ) : !data ? (
        <div className="py-20 text-center bg-white border rounded-2xl text-slate-400 text-[10px] font-bold uppercase">
          Could not read this trace bundle.
        </div>
      ) : (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {/* Test meta + failure banner */}
          <div className="p-3.5 border-b space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10.5px] font-black text-slate-800">
                {data.test?.className?.split(".").pop()}.{data.test?.methodName}
              </span>
              {data.test?.description && (
                <span className="text-[9px] text-slate-400 font-medium italic truncate max-w-[420px]">
                  {data.test.description}
                </span>
              )}
              {data.locatorHealth?.enabled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 text-[8px] font-black uppercase">
                  <Zap size={9} /> Smart Locator
                </span>
              )}
            </div>
            {data.exception && data.exception.type && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5">
                <p className="text-[9px] font-black uppercase text-rose-600 flex items-center gap-1">
                  <XCircle size={11} /> {data.exception.type}
                </p>
                <p className="text-[9.5px] text-rose-700 font-medium mt-0.5 whitespace-pre-wrap break-words line-clamp-3">
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
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[10px] font-black transition-all border-b-2 -mb-px ${
                  subTab === t.id
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-400 hover:text-slate-700"
                }`}
              >
                <t.icon size={12} /> {t.label}
                {typeof t.count === "number" && (
                  <span
                    className={`text-[8px] rounded-full px-1.5 py-px font-black ${
                      subTab === t.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
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
                    <div className="flex items-center justify-between text-[8px] font-black uppercase text-slate-400">
                      <span>Action Timeline · width ∝ duration</span>
                      <span className="font-mono">Σ {fmtMs(totalDur)}</span>
                    </div>

                    {/* Horizontal action bars */}
                    <div className="flex gap-1.5 overflow-x-auto pb-2">
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
                              active ? "ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50/40" : "hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${STATUS_CLASS[a.status] || "bg-slate-400"}`} />
                              <Icon size={11} className="text-slate-500 shrink-0" />
                              <span className="text-[8px] font-black uppercase text-slate-400">#{i + 1}</span>
                            </div>
                            <p className="text-[9.5px] font-extrabold text-slate-800 truncate mt-1">{a.name}</p>
                            <p className="text-[8px] font-mono font-bold text-slate-400 mt-0.5">{fmtMs(a.durationMs)}</p>
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
                    <table className="w-full text-[9.5px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 uppercase text-[8px] font-black">
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
                              className="border-t hover:bg-indigo-50/40 cursor-pointer"
                            >
                              <td className="px-3 py-1.5 font-mono text-slate-400">
                                {n.startedDateTime ? new Date(n.startedDateTime).toLocaleTimeString() : "—"}
                              </td>
                              <td className="px-2 py-1.5 font-mono font-black text-indigo-700">{n.method || "—"}</td>
                              <td className="px-2 py-1.5 font-mono text-slate-600 truncate max-w-[280px]">{n.url}</td>
                              <td className="px-2 py-1.5">
                                <span
                                  className={`font-mono font-black ${
                                    n.status === null ? "text-slate-400" : n.status < 400 ? "text-emerald-600" : "text-rose-600"
                                  }`}
                                >
                                  {n.status ?? "—"}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-amber-600 font-bold">{fmtMs(n.durationMs)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-slate-500">{fmtBytes(n.size)}</td>
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
                  <div className="bg-slate-950 rounded-xl p-3 font-mono text-[9.5px] leading-relaxed max-h-[54vh] overflow-auto space-y-1">
                    {data.console.map((c, i) => {
                      const lvl = consoleLevel(c.level)
                      const hint = sourceHint(c.message)
                      return (
                        <div key={i} className="flex gap-2 items-start hover:bg-white/5 px-1 -mx-1 rounded py-0.5">
                          <span className={`shrink-0 rounded border px-1.5 py-px text-[7.5px] font-black uppercase ${lvl.className}`}>
                            {lvl.label}
                          </span>
                          <span className="shrink-0 text-[8px] uppercase font-black text-slate-500 pt-0.5">{c.source}</span>
                          <span className="flex-1 text-slate-200 break-all whitespace-pre-wrap">{c.message}</span>
                          {hint && <span className="shrink-0 text-[8px] font-mono text-purple-300 pt-0.5">{hint}</span>}
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
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Full observability</p>
                    <p className="text-[9.5px] text-slate-400 font-medium">
                      No unsupported-capability warnings — this browser exposed every signal the trace records.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.browserObservability.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
                        <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-[9.5px] font-medium text-amber-800 break-words">
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
    <div className="py-14 flex flex-col items-center justify-center gap-2 text-slate-400">
      <Icon size={22} />
      <span className="text-[9.5px] uppercase font-bold tracking-wider">{text}</span>
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
      <div className="lg:col-span-2 space-y-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${failed ? "bg-rose-100 text-rose-600" : "bg-indigo-100 text-indigo-600"}`}>
            <Icon size={15} />
          </span>
          <div>
            <p className="text-[11px] font-black text-slate-900">{action.name}</p>
            <p className="text-[8.5px] font-black uppercase text-slate-400">{action.category}</p>
          </div>
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded-full border font-black uppercase px-2 py-0.5 text-[9px] ${statusBadgeClass(
              action.status
            )}`}
          >
            {action.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[9.5px] font-bold text-slate-600 bg-slate-50 border rounded-xl p-3">
          <div>
            <span className="text-slate-400 uppercase text-[8px] block">Duration</span>
            <span className="font-mono">{fmtMs(action.durationMs)}</span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[8px] block">Started</span>
            <span className="font-mono">{action.startTime ? new Date(action.startTime).toLocaleTimeString() : "—"}</span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 uppercase text-[8px] block flex items-center gap-1">
              Locator
              {smartLocator && action.locator && (
                <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 text-indigo-700 px-1 text-[7px] font-black uppercase">
                  <Zap size={7} /> Smart
                </span>
              )}
            </span>
            <span className="font-mono break-all text-indigo-700">{action.locator || "— (no element locator)"}</span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 uppercase text-[8px] block">Page URL</span>
            <span className="font-mono break-all">{action.url || "—"}</span>
          </div>
          {action.message && (
            <div className="col-span-2">
              <span className="text-slate-400 uppercase text-[8px] block">Message</span>
              <span className="break-words">{action.message}</span>
            </div>
          )}
        </div>

        {failed && action.exception?.type && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black uppercase text-rose-600 flex items-center gap-1">
              <XCircle size={11} /> {action.exception.type}
            </p>
            <p className="text-[9.5px] text-rose-700 font-medium break-words">{action.exception.message}</p>
          </div>
        )}

        {failed && source?.snippet && (
          <div className="bg-slate-950 rounded-xl p-3 overflow-x-auto">
            <p className="text-[8px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Code2 size={10} /> {source.file}:{source.line}
            </p>
            <pre className="font-mono text-[9px] leading-relaxed text-slate-200 whitespace-pre">{source.snippet}</pre>
          </div>
        )}
      </div>

      {/* Screenshot at this moment */}
      <div className="space-y-2">
        <span className="text-[8px] font-black uppercase text-slate-400 flex items-center gap-1">
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
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 bg-black/70 text-white text-[8px] font-black uppercase rounded-md px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowUpRight size={9} /> Evidence Vault
            </span>
          </button>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center gap-1.5 bg-slate-50 border rounded-xl text-slate-300">
            <FolderOpen size={16} />
            <span className="text-[8px] font-bold uppercase tracking-wider">No screenshot at this step</span>
          </div>
        )}
        {onOpenEvidence && evidence && (
          <button
            onClick={() => onOpenEvidence(evidence.id)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-xl border border-indigo-100 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-50 text-[9.5px] font-black"
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
    <div className="space-y-1.5 overflow-hidden">
      <span className="text-[8.5px] font-black uppercase text-slate-400">{title}</span>
      {headers.length > 0 && (
        <div className="space-y-0.5 max-h-32 overflow-auto">
          {headers.slice(0, 24).map((h, i) => (
            <p key={i} className="font-mono text-[8.5px] text-slate-300 break-all">
              <span className="text-indigo-300">{h.name}</span>: {h.value}
            </p>
          ))}
        </div>
      )}
      {body ? (
        <pre className="font-mono text-[8.5px] text-emerald-300 leading-relaxed overflow-auto max-h-32 whitespace-pre-wrap break-all">
          {String(body).slice(0, 2000)}
        </pre>
      ) : headers.length === 0 ? (
        <p className="text-[8.5px] text-slate-500 italic">No {title.toLowerCase()} data</p>
      ) : null}
    </div>
  )
}
