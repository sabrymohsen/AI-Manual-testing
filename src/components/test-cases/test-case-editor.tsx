"use client"

/**
 * The test case editor, shared by /test-cases/new and /test-cases/[id]/edit so
 * the two pages can't drift apart (the edit page used to be missing the
 * Manual/Automated switch). Linear-style: big title, writing area on the left,
 * properties on the right, Save with ⌘/Ctrl+Enter.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { StepBuilder } from "@/components/test-cases/step-builder"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import { AssigneeSelect } from "@/components/team/assignee-select"
import { ModuleSelect } from "@/components/bug-reports/module-select"
import { ComposerText } from "@/components/ui/issue-composer"
import { cn } from "@/lib/utils"
import { AlertCircle, ChevronRight, FlaskConical, Hand, Loader2, X, Zap } from "lucide-react"

const REVIEW_STATES: { value: TestCaseDraft["reviewState"]; hint: string }[] = [
  { value: "Draft", hint: "Still being written" },
  { value: "Ready", hint: "Written and runnable" },
  { value: "Approved", hint: "Reviewed and approved" },
  { value: "Deprecated", hint: "Retired — skipped when a plan runs" },
]

export type EditorStep = {
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
  assertions: unknown[]
  [key: string]: unknown
}

export interface TestCaseDraft {
  title: string
  priority: "Low" | "Medium" | "High" | "Critical"
  preconditions: string
  executionType: "Manual" | "Automated"
  suiteId: string
  assignee: string
  requirementIds: string[]
  steps: EditorStep[]
  tags: string[]
  reviewState: "Draft" | "Ready" | "Approved" | "Deprecated"
  /** Minutes for one manual execution; "" when not estimated. */
  estimatedMinutes: number | ""
}

export const EMPTY_DRAFT: TestCaseDraft = {
  title: "",
  priority: "Medium",
  preconditions: "",
  executionType: "Manual",
  suiteId: "",
  assignee: "",
  requirementIds: [],
  steps: [],
  tags: [],
  // New cases start as drafts; mark them Ready once the steps are complete.
  reviewState: "Draft",
  estimatedMinutes: "",
}

const PRIORITIES: { value: TestCaseDraft["priority"]; dot: string }[] = [
  { value: "Critical", dot: "bg-red-500" },
  { value: "High", dot: "bg-orange-500" },
  { value: "Medium", dot: "bg-blue-500" },
  { value: "Low", dot: "bg-slate-400" },
]

export function TestCaseEditor({
  projectId,
  initial,
  heading,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  projectId: string
  initial: TestCaseDraft
  heading: string
  submitLabel: string
  /** Resolve to an error message to show, or nothing on success. */
  onSubmit: (draft: TestCaseDraft) => Promise<string | void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<TestCaseDraft>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof TestCaseDraft>(key: K, value: TestCaseDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => {
    if (!initial.title) titleRef.current?.focus()
    // Only on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!draft.title.trim()) {
      setError("Give the test case a title.")
      titleRef.current?.focus()
      return
    }
    if (saving) return
    setSaving(true)
    setError(null)
    const problem = await onSubmit({ ...draft, title: draft.title.trim() })
    if (problem) {
      setError(problem)
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          save()
        }
      }}
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <Link href={`/projects/${projectId}/test-cases`} className="flex items-center gap-1.5 hover:text-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> Test library
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          <span aria-current="page" className="truncate font-medium text-foreground">{heading}</span>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
            <kbd className="hidden rounded bg-primary-foreground/20 px-1 font-sans text-[10px] sm:inline">⌘↵</kbd>
          </button>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Writing area */}
        <div className="min-w-0">
          {error && (
            <p role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <input
            ref={titleRef}
            name="title"
            aria-label="Test case title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            dir="auto"
            placeholder="Test case title, e.g. Guest can check out with a promo code"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50"
          />

          <ComposerText
            id="preconditions"
            label="Preconditions"
            value={draft.preconditions}
            onChange={(v) => set("preconditions", v)}
            placeholder="What must be true before starting — e.g. user is logged out, cart has 2 items"
            minRows={1}
          />

          <section className="mt-6 border-t border-border pt-4">
            <StepBuilder
              steps={draft.steps as never}
              onChange={(steps) => set("steps", steps as unknown as EditorStep[])}
              projectId={projectId}
              manual={draft.executionType === "Manual"}
            />
          </section>

          <section className="mt-6 border-t border-border pt-4">
            <h2 className="mb-2 text-[13px] font-medium text-foreground">Covers user stories</h2>
            <LinkedRequirementsSelector
              projectId={projectId}
              selectedIds={draft.requirementIds}
              onChange={(ids) => set("requirementIds", ids)}
            />
          </section>
        </div>

        {/* Properties */}
        <aside className="space-y-5 lg:sticky lg:top-16 lg:self-start">
          <Property label="How it runs">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5" role="radiogroup" aria-label="Execution type">
              {(
                [
                  { value: "Manual", icon: Hand, hint: "A tester follows the steps" },
                  { value: "Automated", icon: Zap, hint: "Playwright runs the steps" },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.executionType === o.value}
                  title={o.hint}
                  onClick={() => set("executionType", o.value)}
                  className={cn(
                    "inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium transition-colors",
                    draft.executionType === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <o.icon className="h-3.5 w-3.5" /> {o.value}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {draft.executionType === "Manual"
                ? "A tester follows the steps in a manual run."
                : "Playwright runs the steps; they need actions it understands."}
            </p>
          </Property>

          <Property label="Suite">
            <ModuleSelect
              projectId={projectId}
              value={draft.suiteId}
              onChange={(v) => set("suiteId", v)}
              placeholder="No suite (Unfiled)"
              className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            />
          </Property>

          <Property label="Priority">
            <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.priority === p.value}
                  onClick={() => set("priority", p.value)}
                  className={cn(
                    "flex h-8 flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] transition-colors",
                    draft.priority === p.value
                      ? "border-primary/40 bg-primary/5 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
                  {p.value}
                </button>
              ))}
            </div>
          </Property>

          <Property label="Review state" htmlFor="tc-review">
            <select
              id="tc-review"
              value={draft.reviewState}
              onChange={(e) => set("reviewState", e.target.value as TestCaseDraft["reviewState"])}
              className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              {REVIEW_STATES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.value} — {r.hint}
                </option>
              ))}
            </select>
          </Property>

          <Property label="Estimated time (minutes)" htmlFor="tc-estimate">
            <input
              id="tc-estimate"
              type="number"
              min={0}
              max={10000}
              inputMode="numeric"
              value={draft.estimatedMinutes}
              onChange={(e) => {
                const v = e.target.value
                set("estimatedMinutes", v === "" ? "" : Math.max(0, Math.min(10000, Math.round(Number(v)) || 0)))
              }}
              placeholder="e.g. 10"
              className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">How long one manual execution takes — used to size runs and plans.</p>
          </Property>

          <Property label="Tags" htmlFor="tc-tags">
            <TagInput id="tc-tags" value={draft.tags} onChange={(v) => set("tags", v)} />
          </Property>

          <Property label="Assignee" htmlFor="tc-assignee">
            <AssigneeSelect
              id="tc-assignee"
              projectId={projectId}
              value={draft.assignee}
              onChange={(v) => set("assignee", v)}
              className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            />
          </Property>
        </aside>
      </div>
    </form>
  )
}

function Property({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Type a tag and press Enter or comma; Backspace on an empty field removes the last one. */
function TagInput({ id, value, onChange }: { id?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("")
  const commit = (raw: string) => {
    const parts = raw.split(",").map((t) => t.trim()).filter((t) => t && t.length <= 40)
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])).slice(0, 30))
    setText("")
  }
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-card px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)] focus-within:ring-2 focus-within:ring-primary/30">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px]">
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="rounded text-muted-foreground hover:text-foreground"
            aria-label={`Remove tag ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(",")) commit(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            // Enter adds the tag instead of submitting the form.
            e.preventDefault()
            commit(text)
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => text.trim() && commit(text)}
        placeholder={value.length ? "" : "smoke, regression…"}
        className="h-6 min-w-[80px] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  )
}
