"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  KanbanSquare,
  Link2,
  Loader2,
  Plus,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { BrdAnalysis } from "@/components/brd/brd-analysis"
import { BrdToBoard, boardSummary } from "@/components/brd/brd-to-board"
import { cn } from "@/lib/utils"

/**
 * Requirements & coverage for one BRD — the tester's traceability view.
 *
 * Requirements are found in the document (or added by hand); each one links
 * to the test cases that verify it. Coverage comes from those cases' last
 * results. When a new BRD version changes a requirement, its linked cases are
 * flagged "needs review" here and in the test library.
 */

type Coverage = "uncovered" | "covered" | "passing" | "failing" | "removed"
interface LinkedCase {
  id: string
  title: string
  lastStatus: string
  reviewState: string
  priority: string
  needsReview: boolean
  reviewReason: string | null
}
interface Requirement {
  id: string
  key: string
  title: string
  description: string
  priority: string | null
  status: "active" | "changed" | "removed"
  changedInVersion: number | null
  previousText: string | null
  acceptanceCriteria: string[]
  sourceQuote: string | null
  section: string | null
  origin: "manual" | "rules" | "ai"
  type: string | null
  parentKey: string | null
  story: { id: string; key: string; status: string } | null
  epic: { id: string; title: string } | null
  coverage: Coverage
  testCases: LinkedCase[]
}
interface Summary {
  total: number
  covered: number
  uncovered: number
  passing: number
  failing: number
  changed: number
  needsReview: number
}

const COVERAGE: Record<Coverage, { label: string; chip: string; icon: typeof CheckCircle2 }> = {
  uncovered: { label: "No tests", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: CircleDashed },
  covered: { label: "Covered", chip: "bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: CheckCircle2 },
  passing: { label: "Passing", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  failing: { label: "Failing", chip: "bg-red-500/10 text-red-700 dark:text-red-400", icon: XCircle },
  removed: { label: "Retired", chip: "bg-muted text-muted-foreground", icon: X },
}

const CASE_STATUS: Record<string, string> = {
  Passed: "text-emerald-600 dark:text-emerald-400",
  Failed: "text-red-600 dark:text-red-400",
  Blocked: "text-orange-600 dark:text-orange-400",
}

type Filter = "all" | "uncovered" | "failing" | "changed" | "review"

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

export function BrdRequirements({
  brdId,
  projectId,
  canEdit,
  initialFilter,
}: {
  brdId: string
  projectId: string
  canEdit: boolean
  initialFilter?: Filter
}) {
  const [reqs, setReqs] = useState<Requirement[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "all")
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newText, setNewText] = useState("")
  const [generating, setGenerating] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Requirement | null>(null)
  const [toBoard, setToBoard] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/brds/${brdId}/requirements`)
    if (res.ok) {
      const d = await res.json()
      setReqs(d.requirements)
      setSummary(d.summary)
    }
    setLoading(false)
  }, [brdId])

  useEffect(() => {
    load()
  }, [load])

  async function addManual() {
    if (!newTitle.trim()) return
    try {
      await send(`/api/brds/${brdId}/requirements`, "POST", { title: newTitle.trim(), description: newText.trim() || undefined })
      setAdding(false)
      setNewTitle("")
      setNewText("")
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function generate(r: Requirement, count: number) {
    setGenerating(r.id)
    try {
      const d = await send(`/api/brds/${brdId}/requirements/${r.id}/generate`, "POST", { count })
      const n = d.testCases.length
      toast.success(
        `Drafted ${n} test case${n === 1 ? "" : "s"} for ${r.key}` +
          (d.linkedToStory && r.story ? `, linked to story ${r.story.key}` : "") +
          " — review them in the test library"
      )
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(null)
    }
  }

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const shown = useMemo(
    () =>
      reqs.filter((r) => {
        if (filter === "uncovered") return r.coverage === "uncovered"
        if (filter === "failing") return r.coverage === "failing"
        if (filter === "changed") return r.status === "changed"
        if (filter === "review") return r.testCases.some((t) => t.needsReview)
        return true
      }),
    [reqs, filter]
  )

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const pct = summary && summary.total ? Math.round((summary.covered / summary.total) * 100) : 0

  return (
    <div className="space-y-4">
      <BrdAnalysis brdId={brdId} projectId={projectId} canEdit={canEdit} onApplied={load} />

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-[160px]">
          <p className="text-[11px] text-muted-foreground">Requirement coverage</p>
          <p className="text-lg font-semibold tabular-nums">
            {summary?.covered ?? 0}/{summary?.total ?? 0} <span className="text-sm font-normal text-muted-foreground">({pct}%)</span>
          </p>
          <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", `All ${summary?.total ?? 0}`],
              ["uncovered", `${summary?.uncovered ?? 0} without tests`],
              ["failing", `${summary?.failing ?? 0} failing`],
              ["changed", `${summary?.changed ?? 0} changed`],
              ["review", `${summary?.needsReview ?? 0} tests need review`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                f === "review" && (summary?.needsReview ?? 0) > 0 && filter !== f && "border-amber-500/40 text-amber-700 dark:text-amber-400"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            {reqs.length > 0 && (
              <button
                onClick={() => setToBoard(!toBoard)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-accent"
                title="Create this BRD's epics and user stories on the Scrum board"
              >
                <KanbanSquare className="h-3.5 w-3.5" /> Create on Scrum board
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        )}
      </div>

      {toBoard && <BrdToBoard brdId={brdId} projectId={projectId} reqs={reqs} onDone={load} onClose={() => setToBoard(false)} />}

      {adding && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Requirement, e.g. Account locks after 5 failed logins"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={2}
            placeholder="Details / acceptance criteria (optional). Paste the exact wording so changes in later versions are detected."
            className="w-full rounded-md border bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="rounded-md border px-3 py-1 text-xs font-medium">
              Cancel
            </button>
            <button
              onClick={addManual}
              disabled={!newTitle.trim()}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              Add requirement
            </button>
          </div>
        </div>
      )}

      {reqs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <ScanSearch className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">No requirements tracked yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {canEdit
              ? "Use “Analyze with AI” (or “Quick scan”) above to pull them out of the document, review them, then link or generate test cases for each one."
              : "Someone who writes test cases can pull requirements out of this document."}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches this filter.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <RequirementCard
              key={r.id}
              r={r}
              brdId={brdId}
              projectId={projectId}
              canEdit={canEdit}
              generating={generating === r.id}
              onGenerate={(n) => generate(r, n)}
              onCreateStory={() =>
                act(async () => {
                  const d = await send(`/api/brds/${brdId}/board`, "POST", { requirementIds: [r.id] })
                  toast.success(boardSummary(d))
                })
              }
              onAccept={() => act(() => send(`/api/brds/${brdId}/requirements/${r.id}`, "PATCH", { status: "active" }), `${r.key} marked up to date`)}
              onRetire={() => act(() => send(`/api/brds/${brdId}/requirements/${r.id}`, "PATCH", { status: "removed" }), `${r.key} retired`)}
              onRestore={() => act(() => send(`/api/brds/${brdId}/requirements/${r.id}`, "PATCH", { status: "active" }))}
              onDelete={() => setPendingDelete(r)}
              onLink={(ids) => act(() => send(`/api/brds/${brdId}/requirements/${r.id}/test-cases`, "POST", { add: ids }), "Linked")}
              onUnlink={(id) => act(() => send(`/api/brds/${brdId}/requirements/${r.id}/test-cases`, "POST", { remove: [id] }))}
              onReviewed={(id) =>
                act(() => send(`/api/brds/${brdId}/requirements/${r.id}/test-cases`, "PATCH", { testCaseId: id, needsReview: false }), "Marked reviewed")
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title={`Delete ${pendingDelete?.key}?`}
        description="The requirement and its links are removed. The linked test cases themselves are kept. To keep its history, retire it instead."
        confirmLabel="Delete requirement"
        onConfirm={async () => {
          if (pendingDelete) await act(() => send(`/api/brds/${brdId}/requirements/${pendingDelete.id}`, "DELETE"))
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function RequirementCard({
  r,
  brdId,
  projectId,
  canEdit,
  generating,
  onGenerate,
  onCreateStory,
  onAccept,
  onRetire,
  onRestore,
  onDelete,
  onLink,
  onUnlink,
  onReviewed,
}: {
  r: Requirement
  brdId: string
  projectId: string
  canEdit: boolean
  generating: boolean
  onGenerate: (count: number) => void
  onCreateStory: () => void
  onAccept: () => void
  onRetire: () => void
  onRestore: () => void
  onDelete: () => void
  onLink: (ids: string[]) => void
  onUnlink: (id: string) => void
  onReviewed: (id: string) => void
}) {
  const [open, setOpen] = useState(r.status === "changed" || r.testCases.some((t) => t.needsReview))
  const [picking, setPicking] = useState(false)
  const cov = COVERAGE[r.coverage]
  const CovIcon = cov.icon

  return (
    <div className={cn("rounded-lg border bg-card", r.status === "removed" && "opacity-60")}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-3 text-left" aria-expanded={open}>
        <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{r.key}</span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className={cn("block text-sm font-medium", r.status === "removed" && "line-through")}>{r.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", cov.chip)}>
              <CovIcon className="h-3 w-3" /> {cov.label}
            </span>
            {r.status === "changed" && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Changed in v{r.changedInVersion}
              </span>
            )}
            <span>
              {r.testCases.length} test case{r.testCases.length === 1 ? "" : "s"}
            </span>
            {r.priority && <span>· {r.priority}</span>}
            {r.origin === "ai" && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">AI</span>}
            {r.story && (
              <Link
                href={`/projects/${projectId}/scrum?task=${r.story.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-700 hover:underline dark:text-violet-400"
                title="The Scrum story made from this requirement"
              >
                <KanbanSquare className="h-3 w-3" /> {r.story.key}
              </Link>
            )}
            {!r.story && r.epic && (
              <Link
                href={`/projects/${projectId}/scrum?view=backlog`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-700 hover:underline dark:text-violet-400"
              >
                <KanbanSquare className="h-3 w-3" /> Epic on board
              </Link>
            )}
            {r.acceptanceCriteria.length > 0 && <span>· {r.acceptanceCriteria.length} criteria</span>}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 pb-3 pt-2.5">
          {r.section && <p dir="auto" className="text-[11px] text-muted-foreground">{r.section}</p>}
          {r.description && r.description !== r.title && (
            <p dir="auto" className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{r.description}</p>
          )}
          {r.acceptanceCriteria.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium">Acceptance criteria</p>
              <ul dir="auto" className="list-disc space-y-0.5 ps-5 text-xs text-muted-foreground">
                {r.acceptanceCriteria.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {r.sourceQuote && r.origin !== "manual" && (
            <blockquote dir="auto" className="border-s-2 border-primary/30 ps-2 text-xs italic text-muted-foreground" title="Text in the document this requirement came from">
              {r.sourceQuote}
            </blockquote>
          )}

          {r.status === "changed" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                This wording is no longer in v{r.changedInVersion}. Check the new version (Versions → Compare), update the text below if needed,
                then re-check the linked tests.
              </p>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <button onClick={onAccept} className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700">
                    Requirement is up to date
                  </button>
                  <button onClick={onRetire} className="rounded-md border px-2.5 py-1 text-[11px] font-medium hover:bg-accent">
                    It was removed — retire it
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Linked test cases */}
          <div className="space-y-1">
            {r.testCases.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <Link
                  href={`/projects/${projectId}/test-cases?case=${t.id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline"
                  title={t.title}
                >
                  {t.title}
                </Link>
                {t.reviewState === "Draft" && (
                  <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">Draft</span>
                )}
                <span className={cn("shrink-0 text-[11px]", CASE_STATUS[t.lastStatus] ?? "text-muted-foreground")}>
                  {t.lastStatus === "NotExecuted" ? "Not run" : t.lastStatus}
                </span>
                {t.needsReview && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                    title={t.reviewReason ?? undefined}
                  >
                    <AlertTriangle className="h-3 w-3" /> Needs review
                  </span>
                )}
                {canEdit && t.needsReview && (
                  <button onClick={() => onReviewed(t.id)} className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent">
                    Reviewed
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => onUnlink(t.id)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label="Unlink test case" title="Unlink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {r.testCases.length === 0 && <p className="text-xs text-muted-foreground">No test cases verify this requirement yet.</p>}
          </div>

          {canEdit && r.status !== "removed" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPicking(!picking)}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-accent"
              >
                <Link2 className="h-3.5 w-3.5" /> Link existing test
              </button>
              <GenerateButton generating={generating} onGenerate={onGenerate} />
              {!r.story && !(/^(epic|ملحمة)$/i.test((r.type ?? "").trim()) && r.epic) && (
                <button
                  onClick={onCreateStory}
                  className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-accent"
                  title="Create this on the Scrum board"
                >
                  <KanbanSquare className="h-3.5 w-3.5" /> {/^(epic|ملحمة)$/i.test((r.type ?? "").trim()) ? "Create epic" : "Create story"}
                </button>
              )}
              <button
                onClick={onRetire}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Retire
              </button>
              <button onClick={onDelete} className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground hover:text-destructive" aria-label="Delete requirement">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {canEdit && r.status === "removed" && (
            <button onClick={onRestore} className="text-[11px] font-medium text-primary hover:underline">
              Bring back
            </button>
          )}

          {picking && (
            <CasePicker
              projectId={projectId}
              exclude={r.testCases.map((t) => t.id)}
              onPick={(ids) => {
                onLink(ids)
                setPicking(false)
              }}
              onClose={() => setPicking(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function GenerateButton({ generating, onGenerate }: { generating: boolean; onGenerate: (n: number) => void }) {
  const [count, setCount] = useState(3)
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border">
      <button
        onClick={() => onGenerate(count)}
        disabled={generating}
        className="inline-flex h-7 items-center gap-1 px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
        title="Draft test cases for this requirement with the project's AI provider"
      >
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-violet-500" />}
        {generating ? "Generating…" : "Generate tests"}
      </button>
      <select
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        disabled={generating}
        aria-label="How many test cases"
        className="h-7 border-l bg-transparent px-1 text-[11px]"
      >
        {[1, 3, 5, 8].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Search the project's test cases and pick one or more to link. */
function CasePicker({
  projectId,
  exclude,
  onPick,
  onClose,
}: {
  projectId: string
  exclude: string[]
  onPick: (ids: string[]) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<{ id: string; title: string; lastStatus: string }[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await fetch(`/api/projects/${projectId}/test-cases/browse?limit=25${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
      if (id !== reqId.current) return
      if (res.ok) setRows((await res.json()).rows)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q, projectId])

  const visible = rows.filter((r) => !exclude.includes(r.id))

  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search test cases…"
          className="h-8 w-full rounded-md border bg-card pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="mt-1.5 max-h-56 overflow-y-auto">
        {loading && <p className="px-2 py-2 text-[11px] text-muted-foreground">Searching…</p>}
        {!loading && visible.length === 0 && <p className="px-2 py-2 text-[11px] text-muted-foreground">No matching test cases.</p>}
        {visible.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent">
            <input
              type="checkbox"
              checked={chosen.includes(r.id)}
              onChange={() => setChosen((c) => (c.includes(r.id) ? c.filter((x) => x !== r.id) : [...c, r.id]))}
              className="accent-[hsl(var(--primary))]"
            />
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border px-2.5 py-1 text-[11px] font-medium">
          Cancel
        </button>
        <button
          onClick={() => onPick(chosen)}
          disabled={!chosen.length}
          className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-60"
        >
          Link {chosen.length || ""}
        </button>
      </div>
    </div>
  )
}
