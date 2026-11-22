"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Quote,
  RefreshCw,
  ScanSearch,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { boardSummary } from "@/components/brd/brd-to-board"
import { BrdIssues } from "@/components/brd/brd-issues"
import {
  KIND_LABEL,
  type AnalysisCandidate,
  type AnalysisView,
} from "@/lib/brd/analysis-types"

/**
 * AI analysis of a BRD: start a run, watch it read the document part by part,
 * then review the suggested requirements before any are added. Each one shows
 * whether its quote was found in the document, so invented ones stand out.
 */

const LANGUAGE_NAME = { ar: "Arabic", en: "English", mixed: "Arabic + English" } as const

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Request failed")
  return data
}

export function BrdAnalysis({
  brdId,
  projectId,
  canEdit,
  canManage,
  onApplied,
  onBrdUpdated,
}: {
  brdId: string
  projectId: string
  canEdit: boolean
  canManage?: boolean
  onApplied: () => void
  onBrdUpdated?: () => void
}) {
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [starting, setStarting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<"requirements" | "issues">("requirements")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [replaceAuto, setReplaceAuto] = useState(true)
  const [toBoard, setToBoard] = useState(true)
  const [kindFilter, setKindFilter] = useState<string>("all")
  const seededFor = useRef<string | null>(null)

  const [fileType, setFileType] = useState<string | null>(null)
  const load = useCallback(async () => {
    const [res, info] = await Promise.all([fetch(`/api/brds/${brdId}/analysis`), fetch(`/api/brds/${brdId}/issues`)])
    if (res.ok) {
      const d = await res.json()
      setAnalysis(d.analysis)
    }
    if (info.ok) setFileType((await info.json()).fileType ?? null)
    setLoaded(true)
  }, [brdId])

  useEffect(() => {
    load()
  }, [load])

  const running = analysis?.status === "queued" || analysis?.status === "running"

  // Poll while it runs.
  useEffect(() => {
    if (!running) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [running, load])

  // Default selection when a run finishes: what was found in the document and
  // isn't tracked yet.
  useEffect(() => {
    if (!analysis || analysis.status !== "done" || seededFor.current === analysis.id) return
    seededFor.current = analysis.id
    setSelected(new Set(analysis.candidates.filter((c) => c.verified).map((c) => c.id)))
    setOpen(true)
  }, [analysis])

  async function start(method: "auto" | "rules") {
    setStarting(true)
    try {
      await send(`/api/brds/${brdId}/analysis`, "POST", { method })
      seededFor.current = null
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  async function apply() {
    if (!analysis) return
    setApplying(true)
    try {
      const r = await send(`/api/brds/${brdId}/analysis/${analysis.id}/apply`, "POST", {
        candidateIds: Array.from(selected),
        replaceAutoFound: replaceAuto,
        sendToBoard: toBoard,
      })
      toast.success(
        [
          r.added ? `Added ${r.added}` : null,
          r.updated ? `updated ${r.updated}` : null,
          r.removed ? `removed ${r.removed} earlier auto-found` : null,
        ]
          .filter(Boolean)
          .join(", ") || "Nothing changed"
      )
      if (r.board && (r.board.storiesCreated || r.board.epicsCreated)) {
        toast.success(boardSummary(r.board), {
          action: { label: "Open board", onClick: () => window.open(`/projects/${projectId}/scrum?view=backlog`, "_self") },
        })
      }
      if (r.boardError) toast.error(`Not added to the Scrum board: ${r.boardError}`)
      await load()
      onApplied()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const candidates = useMemo(() => analysis?.candidates ?? [], [analysis])
  const kinds = useMemo(() => Array.from(new Set(candidates.map((c) => c.kind))), [candidates])
  const shown = kindFilter === "all" ? candidates : candidates.filter((c) => c.kind === kindFilter)
  const verifiedCount = candidates.filter((c) => c.verified).length
  const unverified = candidates.length - verifiedCount
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (!loaded) return null
  if (!analysis && !canEdit) return null

  // Nothing yet: a call to action.
  if (!analysis) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Analyze this BRD with AI</p>
          <p className="text-xs text-muted-foreground">
            Finds epics, user stories, business rules and field rules (Arabic or English), checks each one against the document, and lists
            what&apos;s vague or missing. You review the results before anything is added.
          </p>
        </div>
        <StartButtons starting={starting} onStart={start} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {running
                ? "Analyzing…"
                : analysis.status === "failed"
                  ? "Analysis failed"
                  : `${analysis.method === "ai" ? "AI analysis" : "Rule-based scan"}: ${candidates.length} requirement${candidates.length === 1 ? "" : "s"}, ${analysis.issues.length} issue${analysis.issues.length === 1 ? "" : "s"}`}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {[
                analysis.versionNumber ? `v${analysis.versionNumber}` : null,
                analysis.language ? LANGUAGE_NAME[analysis.language] : null,
                analysis.provider ? `${analysis.provider}${analysis.model ? ` · ${analysis.model}` : ""}` : null,
                analysis.status === "applied" ? "added to requirements" : null,
                analysis.createdByName ? `by ${analysis.createdByName}` : null,
                new Date(analysis.createdAt).toLocaleString(),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {canEdit && !running && <StartButtons starting={starting} onStart={start} again />}
      </div>

      {open && (
        <div className="space-y-3 border-t p-3">
          {running && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {analysis.totalChunks > 1
                  ? `Reading part ${Math.min(analysis.progress + 1, analysis.totalChunks)} of ${analysis.totalChunks}…`
                  : "Reading the document…"}
                <span className="ml-auto">Local models can take a few minutes for a long BRD.</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${analysis.totalChunks ? Math.max(4, (analysis.progress / analysis.totalChunks) * 100) : 8}%` }}
                />
              </div>
            </div>
          )}

          {analysis.outdated && !running && (
            <p className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> This analysis is of v{analysis.versionNumber}; the BRD has a newer
              version. Analyze again to pick up the changes.
            </p>
          )}

          {analysis.error && (
            <p
              className={cn(
                "whitespace-pre-wrap rounded-md px-2.5 py-1.5 text-xs",
                analysis.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}
            >
              {analysis.error}
            </p>
          )}

          {analysis.summary && (
            <div dir="auto" className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed">
              {analysis.summary}
            </div>
          )}

          {(analysis.status === "done" || analysis.status === "applied") && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
                {(
                  [
                    ["requirements", `Requirements (${candidates.length})`],
                    [
                      "issues",
                      `Issues (${analysis.issues.filter((i) => !i.resolution).length}${analysis.issues.some((i) => i.resolution) ? ` open of ${analysis.issues.length}` : ""})`,
                    ],
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    aria-pressed={tab === t}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                ))}
                {tab === "requirements" && unverified > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> {unverified} not found in the document — check before adding
                  </span>
                )}
              </div>

              {tab === "requirements" && (
                <>
                  {candidates.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No requirements were found in this version.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {["all", ...kinds].map((k) => (
                          <button
                            key={k}
                            onClick={() => setKindFilter(k)}
                            aria-pressed={kindFilter === k}
                            className={cn(
                              "rounded-full border px-2 py-0.5",
                              kindFilter === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                            )}
                          >
                            {k === "all" ? "All" : KIND_LABEL[k as keyof typeof KIND_LABEL].en} (
                            {k === "all" ? candidates.length : candidates.filter((c) => c.kind === k).length})
                          </button>
                        ))}
                        {canEdit && analysis.status === "done" && (
                          <span className="ml-auto flex gap-2">
                            <button className="text-primary hover:underline" onClick={() => setSelected(new Set(shown.map((c) => c.id)))}>
                              Select all
                            </button>
                            <button
                              className="text-primary hover:underline"
                              onClick={() => setSelected(new Set(candidates.filter((c) => c.verified).map((c) => c.id)))}
                            >
                              Only found in document
                            </button>
                            <button className="text-primary hover:underline" onClick={() => setSelected(new Set())}>
                              None
                            </button>
                          </span>
                        )}
                      </div>

                      <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
                        {shown.map((c) => (
                          <CandidateRow
                            key={c.id}
                            c={c}
                            selectable={canEdit && analysis.status === "done"}
                            checked={selected.has(c.id)}
                            onToggle={() => toggle(c.id)}
                          />
                        ))}
                      </div>

                      {canEdit && analysis.status === "done" && (
                        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" checked={replaceAuto} onChange={(e) => setReplaceAuto(e.target.checked)} />
                            Remove earlier auto-found requirements that have no linked tests
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" checked={toBoard} onChange={(e) => setToBoard(e.target.checked)} />
                            Also create the epics and user stories on the Scrum board
                          </label>
                          <button
                            onClick={apply}
                            disabled={applying || selected.size === 0}
                            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                          >
                            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Add {selected.size} to requirements
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {tab === "issues" && (
                <BrdIssues
                  brdId={brdId}
                  projectId={projectId}
                  analysis={analysis}
                  canEdit={canManage ?? canEdit}
                  fileType={fileType}
                  onBrdUpdated={onBrdUpdated}
                  onChanged={async () => {
                    await load()
                    onApplied()
                  }}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StartButtons({ starting, onStart, again }: { starting: boolean; onStart: (m: "auto" | "rules") => void; again?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onStart("rules")}
        disabled={starting}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-60"
        title="Find epics, stories and rules by their wording — instant, no AI"
      >
        <ScanSearch className="h-3.5 w-3.5" /> Quick scan
      </button>
      <button
        onClick={() => onStart("auto")}
        disabled={starting}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {starting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : again ? (
          <RefreshCw className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {again ? "Analyze again" : "Analyze with AI"}
      </button>
    </div>
  )
}

function CandidateRow({
  c,
  selectable,
  checked,
  onToggle,
}: {
  c: AnalysisCandidate
  selectable: boolean
  checked: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn("rounded-md border", c.parentKey && "ms-4", !c.verified && "border-amber-500/40")}>
      <div className="flex items-start gap-2 p-2">
        {selectable && (
          <input type="checkbox" className="mt-1" checked={checked} onChange={onToggle} aria-label={`Add ${c.key}`} />
        )}
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-expanded={open}>
          <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{c.key}</span>
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block text-sm font-medium">
              {c.title}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">{KIND_LABEL[c.kind].en}</span>
              {c.verified ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> In document
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Not found in document
                </span>
              )}
              {c.acceptanceCriteria.length > 0 && <span>{c.acceptanceCriteria.length} criteria</span>}
              {!!c.unsupportedCriteria?.length && (
                <span className="text-amber-700 dark:text-amber-400">{c.unsupportedCriteria.length} removed (not in document)</span>
              )}
              {c.priority && <span>· {c.priority}</span>}
              {c.existingKey && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-400">updates {c.existingKey}</span>}
            </span>
          </span>
          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t px-3 pb-3 pt-2 text-xs">
          {c.section && <p className="text-[11px] text-muted-foreground" dir="auto">{c.section}</p>}
          {c.description && c.description !== c.title && (
            <p dir="auto" className="whitespace-pre-wrap leading-relaxed">
              {c.description}
            </p>
          )}
          {c.acceptanceCriteria.length > 0 && (
            <ul dir="auto" className="list-disc space-y-0.5 ps-5 text-muted-foreground">
              {c.acceptanceCriteria.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {!!c.unsupportedCriteria?.length && (
            <div className="rounded-md bg-amber-500/5 p-2">
              <p className="mb-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Removed: the AI wrote these, but they aren&apos;t in this part of the document
              </p>
              <ul dir="auto" className="list-disc space-y-0.5 ps-5 text-muted-foreground line-through">
                {c.unsupportedCriteria.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {c.sourceQuote && (
            <blockquote dir="auto" className="flex gap-1.5 border-s-2 border-primary/30 ps-2 italic text-muted-foreground">
              <Quote className="mt-0.5 h-3 w-3 shrink-0" />
              {c.sourceQuote}
            </blockquote>
          )}
        </div>
      )}
    </div>
  )
}
