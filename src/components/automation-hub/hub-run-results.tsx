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
  Bug,
  Ban,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Lightbulb, Wand2 } from "lucide-react"
import { explainFailure } from "@/lib/hub-explain"

export interface HubTestResultView {
  title: string
  file: string
  line?: number
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted" | "flaky"
  durationMs: number
  retries: number
  error?: { message: string; snippet?: string; line?: number }
  /** Named steps (a no-code test's sentences) with their outcome. */
  steps?: { title: string; status: "passed" | "failed" | "skipped"; durationMs: number; error?: string; expected?: string; actual?: string; screenshot?: string }[]
  /** Elements on the page when it failed. */
  page?: { role: string; name: string }[]
  screenshot?: string
  trace?: string
  video?: string
}

export interface HubExecutionView {
  id: string
  status: string // Queued | Running | Passed | Failed | Cancelled
  /** Runs ahead of this one while Queued (0 = next). */
  queuePosition?: number | null
  projectId?: string | null
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
    Running: "bg-primary/10 text-primary border-primary/25",
    Queued: "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-muted text-muted-foreground border-border",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${map[status] || "bg-muted/50 text-muted-foreground border-border"}`}>
      {status === "Running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "Queued" && <Clock className="h-3 w-3" />}
      {status === "Passed" && <CheckCircle2 className="h-3 w-3" />}
      {status === "Failed" && <XCircle className="h-3 w-3" />}
      {status === "Cancelled" && <Ban className="h-3 w-3" />}
      {status}
    </span>
  )
}

function TestIcon({ status }: { status: HubTestResultView["status"] }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
  if (status === "skipped") return <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
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
  onFixStep,
}: {
  execution: HubExecutionView
  onOpenTrace?: (traceId: string) => void
  showLogByDefault?: boolean
  /** No-code tests: replace a step's text (from a "Did you mean" suggestion) and re-run. */
  onFixStep?: (stepText: string, newText: string) => void
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
          <span className="text-muted-foreground">
            <b className="text-emerald-700">{passed} passed</b>
            {failed > 0 && <>, <b className="text-rose-700">{failed} failed</b></>}
            {flaky > 0 && <>, <b className="text-amber-700">{flaky} flaky</b></>}
            {skipped > 0 && <>, {skipped} skipped</>}
          </span>
        )}
        {execution.duration ? <span className="text-muted-foreground">· {formatDuration(execution.duration)}</span> : null}
        {execution.browser && <span className="text-muted-foreground">· {execution.browser}</span>}
        <span className="text-muted-foreground">· {new Date(execution.createdAt).toLocaleString()}</span>
      </div>

      {isActive(execution.status) && results.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {execution.status === "Queued"
            ? execution.queuePosition
              ? `Queued — ${execution.queuePosition} run${execution.queuePosition === 1 ? "" : "s"} ahead of this one.`
              : "Queued — starts next."
            : "Running… results appear here when it finishes."}
        </p>
      )}

      {results.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {failedFirst.map(({ r, i }) => {
            const traceId = traceIdFor(execution.id, r.trace)
            const expanded = !!open[i]
            const hasDetail = !!(r.error || r.screenshot || r.trace || r.video || r.steps?.length)
            return (
              <li key={i} className="text-sm">
                <button
                  type="button"
                  onClick={() => hasDetail && setOpen((o) => ({ ...o, [i]: !o[i] }))}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${hasDetail ? "hover:bg-muted/50" : "cursor-default"}`}
                >
                  {hasDetail ? (
                    expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <TestIcon status={r.status} />
                  <span className="flex-1 truncate text-foreground">{r.title}</span>
                  {r.retries > 0 && <span className="text-xs text-amber-600">retried {r.retries}×</span>}
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(r.durationMs)}</span>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t bg-muted/60 px-3 py-3 pl-11">
                    {r.steps && r.steps.length > 0 && <StepTimeline r={r} onFixStep={onFixStep} executionId={execution.id} testIndex={i} />}
                    {r.error && !(r.steps && r.steps.length) && <Explain r={r} onFixStep={onFixStep} />}
                    {r.error && (
                      <details className="group" open={!(r.steps && r.steps.length) && !r.page}>
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Technical details</summary>
                        <div className="mt-2 space-y-2">
                          <pre className="whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-800">
                            {r.error.message}
                          </pre>
                          {/* A no-code test's snippet is the step runner's own code — not useful to show. */}
                          {r.error.snippet && !/qa-steps/.test(r.error.snippet) && (
                            <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{r.error.snippet}</pre>
                          )}
                        </div>
                      </details>
                    )}
                    <div className="flex flex-wrap items-start gap-3">
                      {r.screenshot && (
                        <a href={artifactUrl(execution.id, i, "screenshot")} target="_blank" rel="noreferrer" title="Open full size">
                          <img
                            src={artifactUrl(execution.id, i, "screenshot")}
                            alt={`Screenshot at the end of “${r.title}”`}
                            className="max-h-48 rounded-md border bg-card shadow-sm"
                          />
                        </a>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {traceId && onOpenTrace && (
                          <button
                            type="button"
                            onClick={() => onOpenTrace(traceId)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/25 hover:text-primary"
                          >
                            <Route className="h-3.5 w-3.5" /> Open trace
                          </button>
                        )}
                        {r.trace && (
                          <a
                            href={artifactUrl(execution.id, i, "trace")}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/25 hover:text-primary"
                            title="Open with: npx playwright show-trace <file>"
                          >
                            <Download className="h-3.5 w-3.5" /> Trace .zip
                          </a>
                        )}
                        {r.video && (
                          <button
                            type="button"
                            onClick={() => setVideo(video === i ? null : i)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/25 hover:text-primary"
                          >
                            <Film className="h-3.5 w-3.5" /> {video === i ? "Hide video" : "Watch video"}
                          </button>
                        )}
                      </div>
                    </div>
                    {!["passed", "skipped"].includes(r.status) && <FileBugButton executionId={execution.id} testIndex={i} />}
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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
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

/** Each step with ✓ / ✗, and the explanation under the one that failed. */
function StepTimeline({
  r,
  onFixStep,
  executionId,
  testIndex,
}: {
  r: HubTestResultView
  onFixStep?: (stepText: string, newText: string) => void
  executionId: string
  testIndex: number
}) {
  const steps = r.steps || []
  const failedAt = steps.findIndex((s) => s.status === "failed")
  const testFailed = !["passed", "skipped"].includes(r.status)
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 text-xs font-semibold text-foreground">What happened</p>
      <ol className="space-y-1">
        {steps.map((st, i) => {
          const notReached = testFailed && failedAt !== -1 && i > failedAt
          return (
            <li key={i}>
              <div className={`flex items-start gap-2 text-[13px] ${notReached ? "text-muted-foreground" : "text-foreground"}`}>
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                {st.status === "failed" ? (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                ) : notReached ? (
                  <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                <span dir="auto" className="min-w-0 flex-1 break-words">
                  {st.title}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{notReached ? "not run" : formatDuration(st.durationMs)}</span>
              </div>
              {(st.expected || st.actual) && !notReached && (
                <div className="ml-12 mt-1 space-y-0.5 text-xs">
                  {st.expected && (
                    <p dir="auto" className="text-muted-foreground">
                      <span className="font-medium">Expected:</span> {st.expected}
                    </p>
                  )}
                  {st.actual && (
                    <p dir="auto" className={st.status === "failed" ? "text-rose-700" : "text-foreground"}>
                      <span className="font-medium">Actual:</span> {st.actual}
                    </p>
                  )}
                </div>
              )}
              {st.screenshot && (
                <a
                  href={`/api/hub/executions/${executionId}/artifact?test=${testIndex}&kind=screenshot&step=${i}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-12 mt-1 block w-fit"
                  title="Open full size"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/hub/executions/${executionId}/artifact?test=${testIndex}&kind=screenshot&step=${i}`}
                    alt={`Step ${i + 1}`}
                    loading="lazy"
                    className="max-h-40 rounded border"
                  />
                </a>
              )}
              {st.status === "failed" && !st.actual && (
                <div className="ml-12 mt-1.5">
                  <Explain r={r} step={st} onFixStep={onFixStep} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {testFailed && failedAt === -1 && r.error && (
        <div className="mt-2">
          <Explain r={r} onFixStep={onFixStep} />
        </div>
      )}
    </div>
  )
}

/** The plain-words reason, tips, and a one-click fix when a close match was on the page. */
function Explain({
  r,
  step,
  onFixStep,
}: {
  r: HubTestResultView
  step?: { title: string; error?: string }
  onFixStep?: (stepText: string, newText: string) => void
}) {
  const e = explainFailure({ error: step?.error || r.error?.message, step: step?.title, page: r.page })
  const fixed = step && e.didYouMean ? step.title.replace(`"${e.didYouMean.from}"`, `"${e.didYouMean.to}"`) : null
  return (
    <div className="space-y-1.5 rounded-md border border-rose-200 bg-rose-50/60 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/20">
      <p className="text-[13px] font-semibold text-rose-800 dark:text-rose-300">{e.headline}</p>
      <p className="text-xs text-foreground/80">{e.detail}</p>
      {e.didYouMean && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Did you mean the {e.didYouMean.role === "textbox" ? "field" : e.didYouMean.role} “{e.didYouMean.to}”?
          </span>
          {onFixStep && fixed && fixed !== step!.title && (
            <button
              type="button"
              onClick={() => onFixStep(step!.title, fixed)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
              title={`Change the step to: ${fixed}`}
            >
              <Wand2 className="h-3 w-3" /> Use “{e.didYouMean.to}” and re-run
            </button>
          )}
        </div>
      )}
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {e.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Files a bug from one failed test: error, steps and screenshot are filled in
 * server-side, and the bug links back to this run.
 */
function FileBugButton({ executionId, testIndex }: { executionId: string; testIndex: number }) {
  const [busy, setBusy] = useState(false)
  const [filed, setFiled] = useState<{ id: string; bugKey: string | null } | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)

  useEffect(() => {
    const m = window.location.pathname.match(/^\/projects\/[^/]+/)
    setProjectPath(m ? m[0] : null)
  }, [])

  async function file() {
    setBusy(true)
    try {
      const res = await fetch(`/api/hub/executions/${executionId}/bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testIndex }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Couldn't file the bug")
      setFiled(d.bug)
      toast.success(`Filed ${d.bug.bugKey ?? "a bug"}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (filed) {
    return (
      <Link
        href={`${projectPath ?? ""}/bug-reports?bugId=${filed.id}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700"
      >
        <Bug className="h-3.5 w-3.5" /> {filed.bugKey ?? "Bug"} filed — open it
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={file}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
      title="Create a bug with this error, the steps and the screenshot"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />} File bug
    </button>
  )
}
