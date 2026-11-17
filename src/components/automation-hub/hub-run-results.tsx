"use client"

/**
 * One run's results: a summary line, then every test with its status, the
 * error and the code around it, the screenshot, and links to its trace and
 * video. Shared by the Tests tab (latest run) and the Runs tab (history).
 */
import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Film,
  Loader2,
  MinusCircle,
  Route,
  Terminal,
  XCircle,
} from "lucide-react"

export interface HubTestResultView {
  title: string
  file: string
  line?: number
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted" | "flaky"
  durationMs: number
  retries: number
  error?: { message: string; snippet?: string; line?: number }
  screenshot?: string
  trace?: string
  video?: string
}

export interface HubExecutionView {
  id: string
  status: string // Queued | Running | Passed | Failed
  logOutput?: string
  browser?: string | null
  duration?: number | null
  createdAt: string
  results?: HubTestResultView[] | null
  script?: { id: string; name: string; folder?: string; type?: string } | null
}

export const isActive = (status?: string) => status === "Queued" || status === "Running"

export function formatDuration(ms?: number | null): string {
  if (!ms && ms !== 0) return ""
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Failed: "bg-rose-50 text-rose-700 border-rose-200",
    Running: "bg-indigo-50 text-indigo-700 border-indigo-200",
    Queued: "bg-amber-50 text-amber-700 border-amber-200",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${map[status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status === "Running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "Queued" && <Clock className="h-3 w-3" />}
      {status === "Passed" && <CheckCircle2 className="h-3 w-3" />}
      {status === "Failed" && <XCircle className="h-3 w-3" />}
      {status}
    </span>
  )
}

function TestIcon({ status }: { status: HubTestResultView["status"] }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
  if (status === "skipped") return <MinusCircle className="h-4 w-4 shrink-0 text-slate-400" />
  if (status === "flaky") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
  return <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
}

/** Trace Viewer id of a finished run's trace: "<executionId>~<test folder>". */
export function traceIdFor(executionId: string, tracePath?: string): string | null {
  if (!tracePath) return null
  const parts = tracePath.split(/[\\/]/)
  return parts.length >= 2 ? `${executionId}~${parts[parts.length - 2]}` : null
}

const artifactUrl = (executionId: string, index: number, kind: "screenshot" | "video" | "trace") =>
  `/api/hub/executions/${executionId}/artifact?test=${index}&kind=${kind}`

export default function HubRunResults({
  execution,
  onOpenTrace,
  showLogByDefault = false,
}: {
  execution: HubExecutionView
  onOpenTrace?: (traceId: string) => void
  showLogByDefault?: boolean
}) {
  const results = execution.results || []
  const failedFirst = results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(a.r.status === "passed") - Number(b.r.status === "passed"))
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [showLog, setShowLog] = useState(showLogByDefault || results.length === 0)
  const [video, setVideo] = useState<number | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  // Open the first failure automatically.
  useEffect(() => {
    const firstFail = results.findIndex((r) => r.status !== "passed" && r.status !== "skipped")
    if (firstFail !== -1) setOpen((o) => (Object.keys(o).length ? o : { [firstFail]: true }))
    if (results.length === 0 && !isActive(execution.status)) setShowLog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution.id, results.length])

  useEffect(() => {
    if (logRef.current && isActive(execution.status)) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [execution.logOutput, execution.status])

  const passed = results.filter((r) => r.status === "passed").length
  const failed = results.filter((r) => ["failed", "timedOut", "interrupted"].includes(r.status)).length
  const skipped = results.filter((r) => r.status === "skipped").length
  const flaky = results.filter((r) => r.status === "flaky").length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={execution.status} />
        {results.length > 0 && (
          <span className="text-slate-600">
            <b className="text-emerald-700">{passed} passed</b>
            {failed > 0 && <>, <b className="text-rose-700">{failed} failed</b></>}
            {flaky > 0 && <>, <b className="text-amber-700">{flaky} flaky</b></>}
            {skipped > 0 && <>, {skipped} skipped</>}
          </span>
        )}
        {execution.duration ? <span className="text-slate-400">· {formatDuration(execution.duration)}</span> : null}
        {execution.browser && <span className="text-slate-400">· {execution.browser}</span>}
        <span className="text-slate-400">· {new Date(execution.createdAt).toLocaleString()}</span>
      </div>

      {isActive(execution.status) && results.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {execution.status === "Queued" ? "Waiting for the run before it to finish…" : "Running… results appear here when it finishes."}
        </p>
      )}

      {results.length > 0 && (
        <ul className="divide-y rounded-lg border bg-white">
          {failedFirst.map(({ r, i }) => {
            const traceId = traceIdFor(execution.id, r.trace)
            const expanded = !!open[i]
            const hasDetail = !!(r.error || r.screenshot || r.trace || r.video)
            return (
              <li key={i} className="text-sm">
                <button
                  type="button"
                  onClick={() => hasDetail && setOpen((o) => ({ ...o, [i]: !o[i] }))}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${hasDetail ? "hover:bg-slate-50" : "cursor-default"}`}
                >
                  {hasDetail ? (
                    expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <TestIcon status={r.status} />
                  <span className="flex-1 truncate text-slate-800">{r.title}</span>
                  {r.retries > 0 && <span className="text-xs text-amber-600">retried {r.retries}×</span>}
                  <span className="shrink-0 text-xs text-slate-400">{formatDuration(r.durationMs)}</span>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t bg-slate-50/60 px-3 py-3 pl-11">
                    {r.error && (
                      <div className="space-y-2">
                        <pre className="whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-800">
                          {r.error.message}
                        </pre>
                        {r.error.snippet && (
                          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{r.error.snippet}</pre>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-start gap-3">
                      {r.screenshot && (
                        <a href={artifactUrl(execution.id, i, "screenshot")} target="_blank" rel="noreferrer" title="Open full size">
                          <img
                            src={artifactUrl(execution.id, i, "screenshot")}
                            alt={`Screenshot at the end of “${r.title}”`}
                            className="max-h-48 rounded-md border bg-white shadow-sm"
                          />
                        </a>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {traceId && onOpenTrace && (
                          <button
                            type="button"
                            onClick={() => onOpenTrace(traceId)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                          >
                            <Route className="h-3.5 w-3.5" /> Open trace
                          </button>
                        )}
                        {r.trace && (
                          <a
                            href={artifactUrl(execution.id, i, "trace")}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                            title="Open with: npx playwright show-trace <file>"
                          >
                            <Download className="h-3.5 w-3.5" /> Trace .zip
                          </a>
                        )}
                        {r.video && (
                          <button
                            type="button"
                            onClick={() => setVideo(video === i ? null : i)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                          >
                            <Film className="h-3.5 w-3.5" /> {video === i ? "Hide video" : "Watch video"}
                          </button>
                        )}
                      </div>
                    </div>
                    {video === i && r.video && (
                      <video src={artifactUrl(execution.id, i, "video")} controls autoPlay className="max-h-96 w-full rounded-md border bg-black" />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {execution.logOutput !== undefined && (
        <div>
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <Terminal className="h-3.5 w-3.5" /> {showLog ? "Hide" : "Show"} console output
          </button>
          {showLog && (
            <pre
              ref={logRef}
              className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"
            >
              {execution.logOutput || "No output yet."}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
