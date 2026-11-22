"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileText, HelpCircle, Loader2, Pencil, Plus, Sparkles, Wand2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ISSUE_LABEL, type AnalysisIssue, type AnalysisView } from "@/lib/brd/analysis-types"

/**
 * The Issues tab of a BRD analysis: each issue gets proposed acceptance
 * criteria that a person accepts as they are or edits. Accepted criteria
 * become a user story; "Update the BRD" writes them all into the Word file
 * as one new version.
 */

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

const SEVERITY = {
  high: "bg-red-500/10 text-red-700 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "bg-muted text-muted-foreground",
}

type Filter = "open" | "resolved" | "all"
const DRAFT_GROUP = 6

export function BrdIssues({
  brdId,
  projectId,
  analysis,
  canEdit,
  fileType,
  onChanged,
  onBrdUpdated,
}: {
  brdId: string
  projectId: string
  analysis: AnalysisView
  canEdit: boolean
  fileType: string | null
  onChanged: () => Promise<void> | void
  onBrdUpdated?: () => void
}) {
  const issues = analysis.issues
  const [filter, setFilter] = useState<Filter>("open")
  const [busy, setBusy] = useState<string | null>(null)
  const [toBoard, setToBoard] = useState(true)
  const base = `/api/brds/${brdId}/analysis/${analysis.id}/issues`

  const open = issues.filter((i) => !i.resolution)
  const resolved = issues.filter((i) => i.resolution)
  const pending = resolved.filter((i) => i.resolution!.brdVersion == null)
  const undrafted = open.filter((i) => !i.draft)
  const drafted = open.filter((i) => i.draft)
  const shown = useMemo(
    () => (filter === "open" ? open : filter === "resolved" ? resolved : issues),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, issues]
  )
  const isWord = fileType === "docx"

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  /** Drafts one issue, or every undrafted one in groups of 6 so each group shows as soon as it's ready. */
  async function draft(issueIds?: string[]) {
    const ids = issueIds ?? undrafted.map((i) => i.id)
    setBusy(issueIds?.length === 1 ? `draft:${issueIds[0]}` : "draft")
    let done = 0
    let aiError: string | null = null
    try {
      for (let k = 0; k < ids.length; k += DRAFT_GROUP) {
        if (ids.length > 1) setProgress({ done, total: ids.length })
        const r = await send(base, "POST", { issueIds: ids.slice(k, k + DRAFT_GROUP) })
        done += r.drafted || 0
        aiError = aiError || r.error
        await onChanged()
      }
      if (aiError) toast.warning(`AI unavailable (${aiError}) — started from the reviewer's suggestions instead`)
      else if (done) toast.success(`Drafted criteria for ${done} issue${done === 1 ? "" : "s"}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  async function resolve(i: AnalysisIssue, value: { title: string; criteria: string[] }, edited: boolean, quiet = false) {
    const r = await send(`${base}/${i.id}`, "POST", { ...value, edited, toBoard })
    if (!quiet) {
      const res = r.resolution
      toast.success(
        `Saved as ${res.requirementKey}${res.storyKey ? ` · story ${res.storyKey}` : ""}. ${isWord ? "Click “Update the BRD” to write it into the document." : ""}`
      )
    }
    return r.resolution
  }

  async function acceptAll() {
    setBusy("acceptAll")
    let ok = 0
    try {
      for (const i of drafted) {
        await resolve(i, { title: i.draft!.title, criteria: i.draft!.criteria }, false, true)
        ok++
      }
      toast.success(`Accepted ${ok} issue${ok === 1 ? "" : "s"} as user stories`)
    } catch (e) {
      toast.error(`${ok} accepted, then: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      await onChanged()
    }
  }

  async function writeToBrd() {
    setBusy("write")
    try {
      const r = await send(`/api/brds/${brdId}/issues`, "POST")
      const elsewhere = r.written - r.nearQuote
      toast.success(
        `BRD updated to v${r.versionNumber}: ${r.written} set${r.written === 1 ? "" : "s"} of acceptance criteria written` +
          (elsewhere ? ` (${elsewhere} at the end — their text wasn't found)` : "")
      )
      await onChanged()
      onBrdUpdated?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (issues.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No issues found.</p>

  return (
    <div className="space-y-2">
      {/* Progress + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-xs">
        <span className="font-medium">
          {resolved.length} of {issues.length} resolved
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(resolved.length / issues.length) * 100}%` }} />
        </div>
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <input type="checkbox" checked={toBoard} onChange={(e) => setToBoard(e.target.checked)} />
              Create stories on the Scrum board
            </label>
            {undrafted.length > 0 && (
              <button
                onClick={() => draft()}
                disabled={!!busy}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium hover:bg-accent disabled:opacity-60"
              >
                {busy === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                {busy === "draft" ? (progress ? `Drafting ${Math.min(progress.done + DRAFT_GROUP, progress.total)} of ${progress.total}…` : "Drafting…") : `Draft criteria for ${undrafted.length}`}
              </button>
            )}
            {drafted.length > 0 && (
              <button
                onClick={acceptAll}
                disabled={!!busy}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium hover:bg-accent disabled:opacity-60"
                title="Accept every drafted issue as it is"
              >
                {busy === "acceptAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                Accept all {drafted.length} drafts
              </button>
            )}
            {pending.length > 0 && (
              <button
                onClick={writeToBrd}
                disabled={!!busy || !isWord}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                title={isWord ? "Write the saved criteria into the Word document as a new version" : "Only Word BRDs can be updated"}
              >
                {busy === "write" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Update the BRD ({pending.length})
              </button>
            )}
          </div>
        )}
      </div>
      {pending.length > 0 && !isWord && (
        <p className="text-[11px] text-muted-foreground">
          This BRD is a PDF, so it can&apos;t be edited. The criteria are saved on the user stories; upload a Word version to write them in.
        </p>
      )}

      <div className="flex gap-1.5 text-[11px]">
        {(
          [
            ["open", `Open (${open.length})`],
            ["resolved", `Resolved (${resolved.length})`],
            ["all", `All (${issues.length})`],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn("rounded-full border px-2 py-0.5", filter === f ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-[640px] space-y-1.5 overflow-y-auto pr-1">
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filter === "open" ? "Every issue is resolved." : "Nothing here yet."}
          </p>
        )}
        {shown.map((i) => (
          <IssueCard
            key={i.id}
            i={i}
            projectId={projectId}
            canEdit={canEdit}
            busy={busy}
            onDraft={() => draft([i.id])}
            onSave={async (value, edited) => {
              setBusy(`save:${i.id}`)
              try {
                await resolve(i, value, edited)
                await onChanged()
                return true
              } catch (e) {
                toast.error((e as Error).message)
                return false
              } finally {
                setBusy(null)
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

function IssueCard({
  i,
  projectId,
  canEdit,
  busy,
  onDraft,
  onSave,
}: {
  i: AnalysisIssue
  projectId: string
  canEdit: boolean
  busy: string | null
  onDraft: () => void
  onSave: (v: { title: string; criteria: string[] }, edited: boolean) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const r = i.resolution
  const current = r ? { title: r.title, criteria: r.criteria } : i.draft ? { title: i.draft.title, criteria: i.draft.criteria } : null
  const saving = busy === `save:${i.id}`
  const drafting = busy === `draft:${i.id}` || busy === "draft"

  return (
    <div className={cn("space-y-1.5 rounded-md border p-2.5 text-xs", r && "border-emerald-500/30")}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", SEVERITY[i.severity])}>
          {ISSUE_LABEL[i.kind].en} · {i.severity}
        </span>
        {i.relatedKeys.map((k) => (
          <span key={k} className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            {k}
          </span>
        ))}
        {i.section && (
          <span dir="auto" className="truncate text-muted-foreground">
            {i.section}
          </span>
        )}
        {r && (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> {r.status === "edited" ? "Edited & accepted" : "Accepted"}
          </span>
        )}
      </div>
      <p dir="auto" className="font-medium">
        {i.text}
      </p>
      {i.quote && (
        <blockquote dir="auto" className="border-s-2 border-amber-500/40 ps-2 italic text-muted-foreground">
          {i.quote}
        </blockquote>
      )}
      {i.suggestion && !current && (
        <p dir="auto" className="flex gap-1.5 text-muted-foreground">
          <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" /> {i.suggestion}
        </p>
      )}

      {editing ? (
        <CriteriaEditor
          initial={current ?? { title: "", criteria: [""] }}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            const changed =
              !i.draft || v.title !== i.draft.title || v.criteria.join("\n") !== i.draft.criteria.join("\n")
            if (await onSave(v, changed || r?.status === "edited")) setEditing(false)
          }}
        />
      ) : current ? (
        <div className={cn("space-y-1.5 rounded-md p-2", r ? "bg-emerald-500/5" : "bg-primary/5")}>
          <p className="text-[11px] font-medium text-muted-foreground">
            {r
              ? "Acceptance criteria"
              : i.draft?.by === "ai"
                ? "Proposed acceptance criteria (AI draft — check before accepting)"
                : "Proposed acceptance criteria (from the reviewer's suggestion)"}
          </p>
          <p dir="auto" className="font-medium">
            {current.title}
          </p>
          <ul dir="auto" className="list-disc space-y-0.5 ps-5">
            {current.criteria.map((c, n) => (
              <li key={n}>{c}</li>
            ))}
          </ul>
          {r && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
              {r.requirementKey && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{r.requirementKey}</span>}
              {r.storyKey && r.taskId && (
                <a className="text-primary hover:underline" href={`/projects/${projectId}/scrum?task=${r.taskId}`}>
                  Story {r.storyKey}
                </a>
              )}
              {r.brdVersion ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <FileText className="h-3 w-3" /> In the BRD (v{r.brdVersion}
                  {r.nearQuote === false ? ", at the end" : ""})
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">Not written into the BRD yet</span>
              )}
              {r.byName && <span>· {r.byName}</span>}
            </p>
          )}
          {canEdit && !r?.brdVersion && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {!r && (
                <button
                  onClick={() => onSave(current, false)}
                  disabled={!!busy}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Accept
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                disabled={!!busy}
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              {!r && (
                <button
                  onClick={onDraft}
                  disabled={!!busy}
                  className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
                  title="Ask the AI for a new draft"
                >
                  {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  Redraft
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        canEdit && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              onClick={onDraft}
              disabled={!!busy}
              className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
            >
              {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
              Draft acceptance criteria
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={!!busy}
              className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
            >
              <Pencil className="h-3 w-3" /> Write my own
            </button>
          </div>
        )
      )}
    </div>
  )
}

function CriteriaEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: { title: string; criteria: string[] }
  saving: boolean
  onSave: (v: { title: string; criteria: string[] }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [criteria, setCriteria] = useState<string[]>(initial.criteria.length ? initial.criteria : [""])
  const filled = criteria.map((c) => c.trim()).filter(Boolean)
  const set = (n: number, v: string) => setCriteria((list) => list.map((c, k) => (k === n ? v : c)))

  return (
    <div className="space-y-2 rounded-md border bg-background p-2">
      <label className="block text-[11px] font-medium text-muted-foreground">User story</label>
      <input
        dir="auto"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={300}
        placeholder="As a … I want … / بصفتي … أرغب في …"
        className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
      />
      <label className="block text-[11px] font-medium text-muted-foreground">Acceptance criteria (one testable condition each)</label>
      <div className="space-y-1">
        {criteria.map((c, n) => (
          <div key={n} className="flex items-start gap-1">
            <span className="mt-2 w-4 shrink-0 text-center text-[10px] text-muted-foreground">{n + 1}</span>
            <textarea
              dir="auto"
              value={c}
              onChange={(e) => set(n, e.target.value)}
              rows={Math.min(4, Math.max(1, Math.ceil(c.length / 90)))}
              maxLength={600}
              className="min-h-8 flex-1 resize-y rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={() => setCriteria((list) => (list.length > 1 ? list.filter((_, k) => k !== n) : [""]))}
              className="mt-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Remove criterion ${n + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {criteria.length < 8 && (
          <button
            onClick={() => setCriteria((list) => [...list, ""])}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" /> Add criterion
          </button>
        )}
        <span className="ml-auto" />
        <button onClick={onCancel} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium hover:bg-accent">
          Cancel
        </button>
        <button
          onClick={() => onSave({ title: title.trim(), criteria: filled })}
          disabled={saving || !title.trim() || !filled.length}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          Save as user story
        </button>
      </div>
    </div>
  )
}
