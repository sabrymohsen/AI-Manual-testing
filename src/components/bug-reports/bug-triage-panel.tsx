"use client"

import { useEffect, useState } from "react"
import { Copy, Loader2, Sparkles } from "lucide-react"
import { DECISION_LABEL, type TriageResult } from "@/lib/bug-reports/triage"

/**
 * Triage helpers inside an open bug:
 * - possible duplicates (found by code from similar wording), one click to open;
 * - AI triage with the professional-tester rules: one decision, a reason, and a
 *   suggested severity/priority the user may apply. Nothing changes on its own.
 */

interface Match {
  id: string
  bugKey: string | null
  title: string
  status: string
  score: number
}

const DECISION_TONE: Record<string, string> = {
  Bug: "border-red-500/30 bg-red-500/5",
  RequirementIssue: "border-amber-500/30 bg-amber-500/5",
  TestIssue: "border-sky-500/30 bg-sky-500/5",
  Environment: "border-slate-500/30 bg-slate-500/5",
  Duplicate: "border-violet-500/30 bg-violet-500/5",
  NotABug: "border-emerald-500/30 bg-emerald-500/5",
}

export function BugTriagePanel({
  bugId,
  projectId,
  title,
  steps,
  severity,
  priority,
  onApply,
  onOpenBug,
  runSignal,
}: {
  bugId: string
  projectId: string
  title: string
  steps: string | null
  severity: string
  priority: string
  onApply: (fields: Record<string, unknown>) => Promise<void> | void
  onOpenBug: (id: string) => void
  /** Changes when the T shortcut asks for a triage run. */
  runSignal?: number
}) {
  const [matches, setMatches] = useState<Match[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TriageResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
    const q = new URLSearchParams({ title, excludeId: bugId })
    if (steps) q.set("steps", steps.slice(0, 1500))
    fetch(`/api/projects/${projectId}/bug-reports/similar?${q}`)
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => setMatches([]))
  }, [bugId, projectId, title, steps])

  useEffect(() => {
    if (runSignal) void runTriage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal])

  async function runTriage() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/bug-reports/${bugId}/triage`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "AI triage failed")
      setResult(data.result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const changes: Record<string, unknown> = {}
  if (result?.severity && result.severity !== severity) changes.severity = result.severity
  if (result?.priority && result.priority !== priority) changes.priority = result.priority

  return (
    <div className="space-y-3">
      {matches.length > 0 && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-violet-800 dark:text-violet-300">
            <Copy className="h-3.5 w-3.5" /> Possible duplicates ({matches.length})
          </p>
          <ul className="space-y-1">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-[11px]">
                <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">{m.score}%</span>
                <button onClick={() => onOpenBug(m.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline" title={m.title}>
                  {m.bugKey ?? "BUG"} · {m.title}
                </button>
                <span className="shrink-0 text-muted-foreground">{m.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <p className="min-w-0 flex-1 text-[11px] font-semibold">
            AI triage
            <span className="block font-medium text-muted-foreground">
              Real bug, requirement issue, test issue, environment or duplicate? With a reason and a severity check.
            </span>
          </p>
          <button
            onClick={runTriage}
            disabled={running}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {running ? "Triaging…" : result ? "Run again" : "Triage with AI"}
          </button>
        </div>
        {running && <p className="mt-2 text-[11px] font-medium text-muted-foreground">A local model can take up to a minute.</p>}
        {error && <p className="mt-2 text-[11px] font-medium text-red-600">{error}</p>}
        {result && (
          <div className={`mt-3 space-y-2 rounded-lg border p-3 ${DECISION_TONE[result.decision] ?? ""}`}>
            <p className="text-xs font-bold">
              {DECISION_LABEL[result.decision]}
              {result.duplicateOf && (
                <>
                  {" "}of{" "}
                  <button onClick={() => onOpenBug(result.duplicateOf!.id)} className="underline">
                    {result.duplicateOf.bugKey ?? "another bug"}
                  </button>
                </>
              )}
              <span className="ml-2 font-medium text-muted-foreground">{Math.round(result.confidence * 100)}% sure</span>
            </p>
            <p dir="auto" className="text-[11px] font-medium leading-relaxed">{result.reason}</p>
            {result.question && (
              <p dir="auto" className="text-[11px] font-medium">
                <b>Ask the business:</b> {result.question}
              </p>
            )}
            {(result.severity || result.priority) && (
              <p className="text-[11px] font-medium text-muted-foreground">
                Suggested: severity <b className="text-foreground">{result.severity ?? "—"}</b>, priority{" "}
                <b className="text-foreground">{result.priority ?? "—"}</b>
                {Object.keys(changes).length === 0 && " (already set)"}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.keys(changes).length > 0 && (
                <button
                  onClick={async () => {
                    await onApply(changes)
                  }}
                  className="h-7 rounded-md border bg-background px-2.5 text-[11px] font-semibold hover:bg-muted"
                >
                  Apply {Object.entries(changes).map(([k, v]) => `${k} ${v}`).join(", ")}
                </button>
              )}
              {result.decision === "Duplicate" && result.duplicateOf && (
                <button
                  onClick={async () => {
                    await onApply({ status: "Duplicate", resolution: "Duplicate", resolutionNote: `Duplicate of ${result.duplicateOf!.bugKey ?? result.duplicateOf!.id}` })
                  }}
                  className="h-7 rounded-md border bg-background px-2.5 text-[11px] font-semibold hover:bg-muted"
                >
                  Mark as duplicate
                </button>
              )}
              {result.decision === "NotABug" && (
                <button
                  onClick={async () => {
                    await onApply({ status: "Rejected", resolution: "ByDesign", resolutionNote: `${DECISION_LABEL[result.decision]}: ${result.reason}` })
                  }}
                  className="h-7 rounded-md border bg-background px-2.5 text-[11px] font-semibold hover:bg-muted"
                >
                  Reject with this reason
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
