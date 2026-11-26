"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Copy,
  Download,
  HelpCircle,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "@/components/ui/icons"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { ANSWER_SOURCES, QUESTION_PRIORITIES, stakeholderEmail, type Gate } from "@/lib/brd/readiness"

/**
 * Open questions and the readiness gate for one BRD.
 *
 * A professional tester never fills a gap in the requirement with a guess: a
 * gap becomes a question. High/Medium questions block test design until they
 * are answered, or until a tester records an override (who + why).
 */

interface Question {
  id: string
  key: string
  question: string
  why: string | null
  kind: string
  priority: string
  relatedKeys: string[]
  quote: string | null
  section: string | null
  askTo: string | null
  status: "Open" | "Answered" | "Dismissed"
  answer: string | null
  answeredByName: string | null
  answeredAt: string | null
  answerSource: string | null
  origin: string
}

const PRIORITY_CHIP: Record<string, string> = {
  High: "bg-red-500/10 text-red-700 dark:text-red-400",
  Medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Low: "bg-muted text-muted-foreground",
}
const KIND_LABEL: Record<string, string> = {
  ambiguity: "Ambiguous",
  conflict: "Conflict",
  missing: "Missing",
  untestable: "Not testable",
  question: "Question",
}

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

type Filter = "Open" | "Answered" | "Dismissed" | "all"

export function BrdQuestions({ brdId, canEdit, onGateChange }: { brdId: string; canEdit: boolean; onGateChange?: (g: Gate) => void }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [gate, setGate] = useState<Gate | null>(null)
  const [brdName, setBrdName] = useState("")
  const [analysisIssues, setAnalysisIssues] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>("Open")
  const [adding, setAdding] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [overrideWhy, setOverrideWhy] = useState("")
  const [showEmail, setShowEmail] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/brds/${brdId}/questions`)
    if (res.ok) {
      const d = await res.json()
      setQuestions(d.questions)
      setGate(d.gate)
      setBrdName(d.brdName)
      setAnalysisIssues(d.analysisIssues)
      onGateChange?.(d.gate)
    }
    setLoading(false)
  }, [brdId, onGateChange])

  useEffect(() => {
    load()
  }, [load])

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
      await load()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    }
  }

  const shown = useMemo(() => questions.filter((q) => filter === "all" || q.status === filter), [questions, filter])
  const email = useMemo(() => stakeholderEmail(brdName, questions), [brdName, questions])

  if (loading || !gate) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const counts = {
    Open: questions.filter((q) => q.status === "Open").length,
    Answered: questions.filter((q) => q.status === "Answered").length,
    Dismissed: questions.filter((q) => q.status === "Dismissed").length,
    all: questions.length,
  }

  return (
    <div className="space-y-4">
      {/* Readiness gate */}
      <div
        className={cn(
          "rounded-lg border p-4",
          gate.state === "ready" && "border-emerald-500/30 bg-emerald-500/5",
          gate.state === "blocked" && "border-red-500/30 bg-red-500/5",
          gate.state === "override" && "border-amber-500/30 bg-amber-500/5"
        )}
      >
        <div className="flex flex-wrap items-start gap-3">
          {gate.state === "ready" ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <ShieldAlert className={cn("mt-0.5 h-5 w-5 shrink-0", gate.state === "blocked" ? "text-red-600" : "text-amber-600")} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {gate.state === "ready" && "Ready for test design"}
              {gate.state === "blocked" && `Not ready: ${gate.blocking} blocking question${gate.blocking === 1 ? "" : "s"}`}
              {gate.state === "override" && "Tester override: test design is going ahead with open questions"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {gate.state === "ready" &&
                (gate.total
                  ? "No open High or Medium question is left, so test cases can be designed from this BRD."
                  : "No open questions. Run an analysis to find gaps, or add a question by hand.")}
              {gate.state === "blocked" &&
                `${gate.blockingKeys.join(", ")} change what a test should expect. Answer them, or proceed with a tester override; test generation is blocked until then.`}
              {gate.state === "override" &&
                `By ${gate.override?.byName ?? "a tester"}${gate.override?.at ? ` on ${new Date(gate.override.at).toLocaleString()}` : ""}: “${gate.override?.why}”. Tests generated now are tagged “tester-override”. Blocking: ${gate.blockingKeys.join(", ")}.`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {gate.open} open · {gate.answered} answered · {gate.dismissed} dismissed
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {gate.state === "blocked" && !overriding && (
                <button
                  onClick={() => setOverriding(true)}
                  className="inline-flex h-8 items-center rounded-md border border-amber-500/40 px-3 text-xs font-medium text-amber-800 hover:bg-amber-500/10 dark:text-amber-300"
                >
                  Proceed with override…
                </button>
              )}
              {gate.state === "override" && (
                <button
                  onClick={() => act(() => send(`/api/brds/${brdId}/gate`, "POST", { action: "withdraw" }), "Override withdrawn")}
                  className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                >
                  Withdraw override
                </button>
              )}
            </div>
          )}
        </div>
        {overriding && (
          <div className="mt-3 space-y-2 border-t border-amber-500/20 pt-3">
            <label className="block text-xs font-medium">Why are you proceeding before these are answered? This is recorded with your name.</label>
            <textarea
              autoFocus
              value={overrideWhy}
              onChange={(e) => setOverrideWhy(e.target.value)}
              rows={2}
              placeholder="e.g. Release demo on Thursday; the PO confirmed in stand-up that answers come next week"
              className="w-full rounded-md border bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOverriding(false)} className="rounded-md border px-3 py-1 text-xs font-medium">
                Cancel
              </button>
              <button
                disabled={overrideWhy.trim().length < 5}
                onClick={async () => {
                  if (await act(() => send(`/api/brds/${brdId}/gate`, "POST", { action: "override", why: overrideWhy.trim() }), "Override recorded")) {
                    setOverriding(false)
                    setOverrideWhy("")
                  }
                }}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
              >
                Record override
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {(["Open", "Answered", "Dismissed", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
            )}
          >
            {f === "all" ? "All" : f} {counts[f]}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          {counts.Open > 0 && (
            <button
              onClick={() => setShowEmail(!showEmail)}
              className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent"
              title="A draft email of the open questions for the business. The app never sends it."
            >
              <Mail className="h-3.5 w-3.5" /> Stakeholder email
            </button>
          )}
          {canEdit && analysisIssues > 0 && (
            <button
              onClick={() =>
                act(async () => {
                  const d = await send(`/api/brds/${brdId}/questions`, "POST", { action: "import" })
                  toast.success(d.added ? `${d.added} question${d.added === 1 ? "" : "s"} added from the analysis` : "Every analysis issue is already a question")
                })
              }
              className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent"
              title="Turn the latest analysis's ambiguities, conflicts and gaps into questions"
            >
              <Download className="h-3.5 w-3.5" /> From analysis ({analysisIssues})
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          )}
        </div>
      </div>

      {showEmail && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Draft email (copy it into your mail app; nothing is sent from here)</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
                  toast.success("Email copied")
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-accent"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <button onClick={() => setShowEmail(false)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-xs font-semibold">{email.subject}</p>
          <pre dir="auto" className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-sans text-xs text-muted-foreground">
            {email.body}
          </pre>
        </div>
      )}

      {adding && (
        <QuestionForm
          onCancel={() => setAdding(false)}
          onSave={async (v) => {
            if (await act(() => send(`/api/brds/${brdId}/questions`, "POST", v), "Question added")) setAdding(false)
          }}
        />
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">{questions.length ? "Nothing here" : "No questions yet"}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {questions.length
              ? "Try another filter."
              : "When the analysis finds something the document doesn't settle (vague wording, a missing rule, a conflict), it becomes a question here instead of a guess."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              canEdit={canEdit}
              onPatch={(body, ok) => act(() => send(`/api/brds/${brdId}/questions/${q.id}`, "PATCH", body), ok)}
              onDelete={() => setPendingDelete(q)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title={`Delete ${pendingDelete?.key}?`}
        description="The question and its answer are removed. To keep a record, dismiss it instead."
        confirmLabel="Delete question"
        onConfirm={async () => {
          if (pendingDelete) await act(() => send(`/api/brds/${brdId}/questions/${pendingDelete.id}`, "DELETE"), "Question deleted")
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

interface FormValue {
  question: string
  why: string | null
  priority: string
  relatedKeys: string[]
  askTo: string | null
}

function QuestionForm({ initial, onSave, onCancel }: { initial?: Partial<FormValue>; onSave: (v: FormValue) => void; onCancel: () => void }) {
  const [question, setQuestion] = useState(initial?.question ?? "")
  const [why, setWhy] = useState(initial?.why ?? "")
  const [priority, setPriority] = useState(initial?.priority ?? "Medium")
  const [related, setRelated] = useState((initial?.relatedKeys ?? []).join(", "))
  const [askTo, setAskTo] = useState(initial?.askTo ?? "")
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <textarea
        autoFocus
        dir="auto"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="The question, e.g. Which exact error text is shown when the password is empty?"
        className="w-full rounded-md border bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
      <input
        dir="auto"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why it matters for testing (optional)"
        className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex flex-wrap gap-2">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-xs" aria-label="Priority">
          {QUESTION_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p} {p === "High" ? "(blocks a test)" : p === "Medium" ? "(changes an expected result)" : "(nice to know)"}
            </option>
          ))}
        </select>
        <input
          value={related}
          onChange={(e) => setRelated(e.target.value)}
          placeholder="Requirements, e.g. FR-01, US-3"
          className="h-8 min-w-[180px] flex-1 rounded-md border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          value={askTo}
          onChange={(e) => setAskTo(e.target.value)}
          placeholder="Ask (PO, BA, Dev…)"
          className="h-8 w-36 rounded-md border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border px-3 py-1 text-xs font-medium">
          Cancel
        </button>
        <button
          disabled={question.trim().length < 3}
          onClick={() =>
            onSave({
              question: question.trim(),
              why: why.trim() || null,
              priority,
              relatedKeys: related.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
              askTo: askTo.trim() || null,
            })
          }
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function QuestionCard({
  q,
  canEdit,
  onPatch,
  onDelete,
}: {
  q: Question
  canEdit: boolean
  onPatch: (body: object, ok?: string) => Promise<boolean>
  onDelete: () => void
}) {
  const [mode, setMode] = useState<"view" | "answer" | "edit">("view")
  const [answer, setAnswer] = useState(q.answer ?? "")
  const [source, setSource] = useState(q.answerSource ?? "email")

  if (mode === "edit") {
    return (
      <QuestionForm
        initial={q}
        onCancel={() => setMode("view")}
        onSave={async (v) => {
          if (await onPatch(v, "Question updated")) setMode("view")
        }}
      />
    )
  }

  return (
    <div className={cn("rounded-lg border bg-card p-3", q.status === "Dismissed" && "opacity-60")}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{q.key}</span>
        <div className="min-w-0 flex-1">
          <p dir="auto" className="text-sm font-medium">{q.question}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded px-2 py-0.5 font-medium", PRIORITY_CHIP[q.priority] ?? PRIORITY_CHIP.Low)}>{q.priority}</span>
            <span>{KIND_LABEL[q.kind] ?? q.kind}</span>
            {q.status !== "Open" && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium",
                  q.status === "Answered" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted"
                )}
              >
                {q.status === "Answered" && <CheckCircle2 className="h-3 w-3" />} {q.status}
              </span>
            )}
            {q.relatedKeys.map((k) => (
              <span key={k} className="rounded border px-2 py-0.5">{k}</span>
            ))}
            {q.askTo && <span>· ask {q.askTo}</span>}
            {q.origin === "analysis" && <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">from analysis</span>}
          </div>
          {q.why && <p dir="auto" className="mt-2 text-xs text-muted-foreground">{q.why}</p>}
          {q.quote && (
            <blockquote dir="auto" className="mt-2 border-s-2 border-primary/30 ps-2 text-xs text-muted-foreground">{q.quote}</blockquote>
          )}
          {q.answer && mode !== "answer" && (
            <div className="mt-2 rounded-md bg-emerald-500/5 p-2 text-xs">
              <p dir="auto" className="whitespace-pre-wrap">{q.answer}</p>
              {q.answeredByName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {q.answeredByName}
                  {q.answerSource ? ` · via ${q.answerSource}` : ""}
                  {q.answeredAt ? ` · ${new Date(q.answeredAt).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>
          )}
          {mode === "answer" && (
            <div className="mt-2 space-y-2">
              <textarea
                autoFocus
                dir="auto"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={2}
                placeholder="The answer exactly as the business gave it"
                className="w-full rounded-md border bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="text-xs text-muted-foreground">Answered via</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="h-7 rounded-md border bg-card px-2 text-xs">
                  {ANSWER_SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button onClick={() => setMode("view")} className="rounded-md border px-3 py-1 text-xs font-medium">
                  Cancel
                </button>
                <button
                  disabled={!answer.trim()}
                  onClick={async () => {
                    if (await onPatch({ answer: answer.trim(), answerSource: source }, `${q.key} answered`)) setMode("view")
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  Save answer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {canEdit && mode === "view" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          {q.status === "Open" && (
            <>
              <button onClick={() => setMode("answer")} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Answer
              </button>
              <button
                onClick={() => onPatch({ status: "Dismissed" }, `${q.key} dismissed`)}
                className="inline-flex h-7 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                title="Not a real question (e.g. the analysis misread the document)"
              >
                Dismiss
              </button>
            </>
          )}
          {q.status !== "Open" && (
            <button onClick={() => onPatch({ status: "Open" }, `${q.key} reopened`)} className="inline-flex h-7 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-accent">
              <RotateCcw className="h-3.5 w-3.5" /> Reopen
            </button>
          )}
          {q.status === "Answered" && (
            <button onClick={() => setMode("answer")} className="inline-flex h-7 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent">
              Edit answer
            </button>
          )}
          <button onClick={() => setMode("edit")} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button onClick={onDelete} className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${q.key}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
