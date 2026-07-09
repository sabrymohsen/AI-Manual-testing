"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { X, Trash2, Flag, FlaskConical, Bug, ExternalLink, Loader2, Check, Tag, Plus, SquareCheckBig, CornerDownRight, MessageCircle } from "lucide-react"
import { Story, Sprint, EpicLite, WORKFLOW_STATUSES, PRIORITY_COLOR, POINT_OPTIONS, issueTypeOf, ConfirmModal } from "./shared"
import { CreateTestCaseModal } from "./create-artifact-modals"
import { CreateBugModal } from "@/components/bug-reports/create-bug-modal"
import ActivityFeed from "./activity-feed"

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const
const SEVERITY_COLOR: Record<string, string> = {
  Critical: "text-red-600", High: "text-orange-500", Medium: "text-amber-500", Low: "text-slate-400",
}

/**
 * Issue detail drawer (slide-over). Type-aware editing: a Story shows epic /
 * points / acceptance-criteria / child-tasks; a Task hides those and shows its
 * parent story. Test cases use a QA modal; bugs use the shared Bug Report form
 * and are linked to the story. Mount with key={story.id} so it re-seeds.
 */
export default function IssueDrawer({
  story,
  projectId,
  sprints,
  epics,
  onPatch,
  onDelete,
  onReload,
  onClose,
}: {
  story: Story
  projectId: string
  sprints: Sprint[]
  epics: EpicLite[]
  onPatch: (s: Story, body: Record<string, unknown>) => void
  onDelete: (s: Story) => Promise<void>
  onReload: () => Promise<void>
  onClose: () => void
}) {
  const router = useRouter()
  const type = issueTypeOf(story.requirementKey)
  const isStory = type.id === "Story"
  const [title, setTitle] = useState(story.title)
  const [desc, setDesc] = useState(story.description || "")
  const [ac, setAc] = useState(story.acceptanceCriteria || "")
  const [newLabel, setNewLabel] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [artifactModal, setArtifactModal] = useState<"test" | "bug" | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const testLinks = story.testCases || []
  const bugLinks = story.bugReports || []
  const children = story.children || []
  const testCount = testLinks.length
  const bugCount = bugLinks.length
  const labels = story.labels || []

  const flash = (k: string) => { setSavedFlash(k); setTimeout(() => setSavedFlash((c) => (c === k ? null : c)), 1200) }
  const saveText = (field: "title" | "description" | "acceptanceCriteria", value: string) => {
    const orig = field === "title" ? story.title : field === "description" ? story.description || "" : story.acceptanceCriteria || ""
    if (value === orig) return
    if (field === "title" && !value.trim()) { setTitle(story.title); return }
    onPatch(story, { [field]: value })
    flash(field)
  }
  const addLabel = () => {
    const l = newLabel.trim()
    if (!l || labels.includes(l)) { setNewLabel(""); return }
    onPatch(story, { labels: [...labels, l] })
    setNewLabel("")
  }
  const removeLabel = (l: string) => onPatch(story, { labels: labels.filter((x) => x !== l) })

  const doDelete = async () => {
    setDeleting(true)
    await onDelete(story)
  }

  // Link a freshly created bug (from the shared Bug Report modal) to this story.
  const onBugCreated = async (bug: any) => {
    if (bug?.id) {
      await fetch(`/api/requirements/${story.id}/link-bugs`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bugReportIds: [bug.id] }),
      }).catch(() => {})
    }
    await onReload()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-card border-l shadow-2xl w-full max-w-xl h-full flex flex-col animate-in slide-in-from-right duration-200" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <type.icon className={`h-4 w-4 shrink-0 ${type.color}`} />
            <span className="text-xs font-mono font-black text-indigo-600">{story.requirementKey}</span>
            <span className="text-[10px] font-bold text-muted-foreground">· {type.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href={`/projects/${projectId}/requirements/${story.id}`} className="h-8 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1" title="Open full details">
              <ExternalLink className="h-3.5 w-3.5" /> Details
            </Link>
            <button onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50" title="Delete issue">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Parent breadcrumb (tasks) */}
          {story.parent && (
            <Link href={`/projects/${projectId}/requirements/${story.parent.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline">
              <CornerDownRight className="h-3.5 w-3.5" /> {story.parent.requirementKey} · <span className="font-semibold text-muted-foreground truncate max-w-[220px]">{story.parent.title}</span>
            </Link>
          )}

          {/* Title */}
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveText("title", title.trim())}
            rows={2}
            className="w-full text-lg font-black text-slate-900 dark:text-slate-100 bg-transparent resize-none border border-transparent hover:border-border focus:border-indigo-500 rounded-lg px-2 py-1 -mx-2 focus:outline-none"
          />

          {/* Status transition — the core "flow" control */}
          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              {WORKFLOW_STATUSES.map((st) => (
                <button
                  key={st.id}
                  onClick={() => story.status !== st.id && onPatch(story, { status: st.id })}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-black transition-all ${story.status === st.id ? st.color + " ring-2 ring-offset-1 ring-indigo-400 dark:ring-offset-slate-900" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Field grid — points / epic only for stories */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <div className="relative">
                <Flag className={`h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${PRIORITY_COLOR[story.priority]}`} />
                <select value={story.priority} onChange={(e) => onPatch(story, { priority: e.target.value })} className="w-full h-9 pl-8 pr-2 text-xs font-bold rounded-lg border bg-background">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </Field>
            {isStory && (
              <Field label="Story points">
                <select value={story.storyPoints ?? 0} onChange={(e) => onPatch(story, { storyPoints: Number(e.target.value) || null })} className="w-full h-9 px-2 text-xs font-bold rounded-lg border bg-background">
                  <option value={0}>None</option>
                  {POINT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}
            {isStory && (
              <Field label="Epic">
                <select value={story.epic?.id || ""} onChange={(e) => onPatch(story, { epicId: e.target.value || null })} className="w-full h-9 px-2 text-xs font-bold rounded-lg border bg-background">
                  <option value="">No epic</option>
                  {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.epicKey} · {ep.title}</option>)}
                </select>
              </Field>
            )}
            <Field label="Sprint">
              <select value={story.sprintId || ""} onChange={(e) => onPatch(story, { sprintId: e.target.value || null })} className="w-full h-9 px-2 text-xs font-bold rounded-lg border bg-background">
                <option value="">Backlog</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "Active" ? " (active)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Assignee">
              <input
                defaultValue={story.assignee || ""}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (story.assignee || "")) onPatch(story, { assignee: v || null }) }}
                placeholder="Unassigned"
                className="w-full h-9 px-2.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </Field>
          </div>

          {/* ── Due Date ── */}
          <Field label="Due date">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={story.dueDate ? new Date(story.dueDate).toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const val = e.target.value
                  onPatch(story, { dueDate: val ? new Date(val).toISOString() : null })
                }}
                className="h-9 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {story.dueDate && new Date(story.dueDate) < new Date() && story.status !== "Covered" && (
                <span className="text-[11px] font-bold text-red-600 bg-red-100 dark:bg-red-500/15 px-2 py-0.5 rounded-full">Overdue</span>
              )}
            </div>
          </Field>

          {/* ── Time Tracking ── */}
          <Field label="Time tracking">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Original (h)</label>
                  <input
                    type="number"
                    min={0}
                    value={story.timeEstimate ? Math.round(story.timeEstimate / 60 * 10) / 10 : ""}
                    onChange={(e) => {
                      const hrs = parseFloat(e.target.value) || 0
                      onPatch(story, { timeEstimate: Math.round(hrs * 60) })
                    }}
                    className="w-full h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Spent (h)</label>
                  <input
                    type="number"
                    min={0}
                    value={story.timeSpent ? Math.round(story.timeSpent / 60 * 10) / 10 : ""}
                    onChange={(e) => {
                      const hrs = parseFloat(e.target.value) || 0
                      onPatch(story, { timeSpent: Math.round(hrs * 60) })
                    }}
                    className="w-full h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Remaining (h)</label>
                  <div className="h-8 flex items-center text-xs font-bold text-muted-foreground">
                    {story.timeEstimate && story.timeSpent != null
                      ? Math.max(0, Math.round((story.timeEstimate - story.timeSpent) / 60 * 10) / 10)
                      : "—"}
                  </div>
                </div>
              </div>
              {story.timeEstimate && story.timeEstimate > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((story.timeSpent || 0) / story.timeEstimate) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </Field>

          {/* Labels */}
          <Field label="Labels">
            <div className="flex flex-wrap items-center gap-1.5">
              {labels.map((l) => (
                <span key={l} className="text-[11px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                  <Tag className="h-2.5 w-2.5" />{l}
                  <button onClick={() => removeLabel(l)} className="hover:text-red-600"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLabel() }} placeholder="Add label" className="h-7 w-24 px-2 text-[11px] rounded-full border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                <button onClick={addLabel} className="h-7 w-7 flex items-center justify-center rounded-full border hover:bg-muted text-muted-foreground"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </Field>

          {/* Description */}
          <Field label="Description" saved={savedFlash === "description"}>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => saveText("description", desc)} rows={4} placeholder="Add a description…" className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </Field>

          {/* Acceptance criteria — stories only */}
          {isStory && (
            <Field label="Acceptance criteria" saved={savedFlash === "acceptanceCriteria"}>
              <textarea value={ac} onChange={(e) => setAc(e.target.value)} onBlur={() => saveText("acceptanceCriteria", ac)} rows={3} placeholder="Given / When / Then…" className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </Field>
          )}

          {/* ── Child tasks — stories only ── */}
          {isStory && (
            <Section icon={SquareCheckBig} title="Tasks" count={children.length || undefined} accent="text-sky-600"
              action={<SectionButton onClick={() => router.push(`/projects/${projectId}/board/create?type=task&parent=${story.id}`)} className="text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10">Add task</SectionButton>}>
              <div className="space-y-1">
                {children.map((c) => (
                  <Link key={c.id} href={`/projects/${projectId}/requirements/${c.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60 text-sm">
                    <SquareCheckBig className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="text-[10px] font-mono font-bold text-sky-700 dark:text-sky-400">{c.requirementKey}</span>
                    <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{c.title}</span>
                    <span className="text-[10px] font-bold text-muted-foreground">{c.status}</span>
                  </Link>
                ))}
                {children.length === 0 && <p className="text-xs text-muted-foreground px-1.5 py-1">No tasks yet.</p>}
              </div>
            </Section>
          )}

          {/* ── Test cases ── */}
          <Section icon={FlaskConical} title="Test cases" count={testCount || undefined} accent="text-emerald-600"
            action={<SectionButton onClick={() => setArtifactModal("test")} className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">New test case</SectionButton>}>
            <div className="space-y-1">
              {testLinks.map((l) => (
                <Link key={l.testCase.id} href={`/projects/${projectId}/test-cases/${l.testCase.id}/edit`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60 text-sm">
                  <FlaskConical className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  {l.testCase.testCaseKey && <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400">{l.testCase.testCaseKey}</span>}
                  <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{l.testCase.title}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
              ))}
              {testCount === 0 && <p className="text-xs text-muted-foreground px-1.5 py-1">No test cases yet.</p>}
            </div>
          </Section>

          {/* ── Bugs ── */}
          <Section icon={Bug} title="Bugs" count={bugCount || undefined} accent="text-red-600"
            action={<SectionButton onClick={() => setArtifactModal("bug")} className="text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">Report bug</SectionButton>}>
            <div className="space-y-1">
              {bugLinks.map((l) => (
                <Link key={l.bugReport.id} href={`/projects/${projectId}/bug-reports/${l.bugReport.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60 text-sm">
                  <Bug className={`h-3.5 w-3.5 shrink-0 ${SEVERITY_COLOR[l.bugReport.severity] || "text-slate-400"}`} />
                  <span className="text-[10px] font-mono font-bold text-red-700 dark:text-red-400">{l.bugReport.bugKey}</span>
                  <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{l.bugReport.title}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">{l.bugReport.status}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
              ))}
              {bugCount === 0 && <p className="text-xs text-muted-foreground px-1.5 py-1">No bugs raised.</p>}
            </div>
          </Section>

          {/* ── Comments / Activity ── */}
          <Section icon={MessageCircle} title="Activity" accent="text-indigo-600">
            <ActivityFeed requirementId={story.id} />
          </Section>
        </div>
      </div>

      {artifactModal === "test" && (
        <CreateTestCaseModal projectId={projectId} requirementId={story.id} storyKey={story.requirementKey} onClose={() => setArtifactModal(null)} onCreated={onReload} />
      )}
      {/* Shared Bug Report form (steps, severity, attachments, AI) — links result to this story */}
      <CreateBugModal
        projectId={projectId}
        open={artifactModal === "bug"}
        onClose={() => setArtifactModal(null)}
        onCreated={onBugCreated}
        initialValues={{ title: "" }}
      />
      {showDeleteConfirm && (
        <ConfirmModal
          title={`Delete ${story.requirementKey}`}
          message={`Are you sure you want to permanently delete this user story? This action cannot be undone.`}
          onConfirm={() => {
            doDelete()
            setShowDeleteConfirm(false)
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

function SectionButton({ onClick, className, children }: { onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-7 px-2 rounded-md text-[11px] font-black flex items-center gap-1 transition-colors ${className || ""}`}>
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  )
}

function Section({ icon: Icon, title, count, accent, action, children }: { icon: React.ComponentType<{ className?: string }>; title: string; count?: string | number; accent?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl bg-card/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${accent || "text-indigo-600"}`} />
        <span className="text-xs font-black text-slate-700 dark:text-slate-200">{title}</span>
        {count !== undefined && <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-1.5">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, saved, children }: { label: string; saved?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {label}
        {saved && <span className="text-emerald-600 flex items-center gap-0.5 normal-case tracking-normal font-bold"><Check className="h-3 w-3" /> Saved</span>}
      </label>
      {children}
    </div>
  )
}
