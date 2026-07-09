"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BackButton } from "@/components/ui/back-button"
import { BookMarked, SquareCheckBig, Loader2 } from "lucide-react"
import { Story, nextIssueKey } from "@/components/board/shared"

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const
const POINTS = [1, 2, 3, 5, 8, 13, 21]
const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"

/**
 * Full-page create form for board work items. Type = Story or Task:
 * a Story links to an Epic; a Task links to a parent Story (Epic → Story →
 * Task). Bugs are created via the Bug Report form, not here.
 */
export default function CreateWorkItemPage() {
  const params = useParams()
  const router = useRouter()
  const search = useSearchParams()
  const projectId = params.id as string

  const [type, setType] = useState<"Story" | "Task">(search.get("type") === "task" ? "Task" : "Story")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("")
  const [priority, setPriority] = useState("Medium")
  const [points, setPoints] = useState(0)
  const [epicId, setEpicId] = useState("")
  const [parentId, setParentId] = useState(search.get("parent") || "")
  const [sprintId, setSprintId] = useState(search.get("sprint") || "")
  const [assignee, setAssignee] = useState("")
  const [labelsText, setLabelsText] = useState("")

  const [stories, setStories] = useState<Story[]>([])
  const [epics, setEpics] = useState<{ id: string; epicKey: string; title: string }[]>([])
  const [sprints, setSprints] = useState<{ id: string; name: string; status: string }[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/requirements`).then((r) => (r.ok ? r.json() : { requirements: [] })),
      fetch(`/api/projects/${projectId}/epics`).then((r) => (r.ok ? r.json() : { epics: [] })),
      fetch(`/api/projects/${projectId}/sprints`).then((r) => (r.ok ? r.json() : { sprints: [] })),
    ]).then(([r, e, s]) => {
      setStories(r.requirements || [])
      setEpics((e.epics || []).map((x: any) => ({ id: x.id, epicKey: x.epicKey, title: x.title })))
      setSprints((s.sprints || []).map((x: any) => ({ id: x.id, name: x.name, status: x.status })))
      setLoadingData(false)
    })
  }, [projectId])

  // Candidate parent stories: everything that isn't itself a Task/Bug.
  const parentCandidates = useMemo(
    () => stories.filter((s) => {
      const p = s.requirementKey.split("-")[0]?.toUpperCase()
      return p !== "TASK" && p !== "BUG"
    }),
    [stories]
  )

  const nextKey = useMemo(() => nextIssueKey(type === "Story" ? "STORY" : "TASK", stories), [type, stories])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    if (type === "Task" && !parentId) { setError("Pick the parent user story for this task."); return }
    setSaving(true)
    setError("")

    const labels = labelsText.split(",").map((l) => l.trim()).filter(Boolean)
    const body =
      type === "Story"
        ? {
            requirementKey: nextKey, title: title.trim(), description: description.trim() || null,
            acceptanceCriteria: acceptanceCriteria.trim() || null, priority, status: "Draft", source: "Manual",
            epicId: epicId || null, sprintId: sprintId || null, storyPoints: points || null,
            assignee: assignee.trim() || null, labels,
          }
        : {
            requirementKey: nextKey, title: title.trim(), description: description.trim() || null,
            priority, status: "Draft", source: "Manual", parentId, sprintId: sprintId || null,
            assignee: assignee.trim() || null, labels,
          }

    const res = await fetch(`/api/projects/${projectId}/requirements`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    if (res.ok) {
      router.push(`/projects/${projectId}/board`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || "Failed to create")
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <BackButton />
      <div className="max-w-2xl mx-auto mt-4 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Create {type.toLowerCase()}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {type === "Story" ? "A piece of user-facing value, linked to an epic." : "A unit of work under a user story."}
            {" "}<span className="font-mono font-bold text-indigo-600">{nextKey}</span>
          </p>
        </div>

        {/* Type toggle */}
        <div className="grid grid-cols-2 gap-3">
          <TypeCard active={type === "Story"} onClick={() => setType("Story")} icon={BookMarked} accent="emerald" title="Story" desc="User-facing value under an Epic" />
          <TypeCard active={type === "Task"} onClick={() => setType("Task")} icon={SquareCheckBig} accent="sky" title="Task" desc="Work item under a User Story" />
        </div>

        {loadingData ? (
          <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {/* Parent: Epic for Story, Story for Task */}
            {type === "Story" ? (
              <div className="space-y-2">
                <Label>Epic</Label>
                <select value={epicId} onChange={(e) => setEpicId(e.target.value)} className={selectCls}>
                  <option value="">No epic</option>
                  {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.epicKey} · {ep.title}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Parent user story <span className="text-red-500">*</span></Label>
                <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectCls} required>
                  <option value="">Select a user story…</option>
                  {parentCandidates.map((s) => <option key={s.id} value={s.id}>{s.requirementKey} · {s.title}</option>)}
                </select>
                {parentCandidates.length === 0 && <p className="text-xs text-amber-600">No user stories yet — create a Story first.</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Summary <span className="text-red-500">*</span></Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder={type === "Story" ? "As a user, I want to…" : "What needs to be done?"} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Add more detail…" className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" />
            </div>

            {/* Story-only: acceptance criteria + points */}
            {type === "Story" && (
              <div className="space-y-2">
                <Label htmlFor="ac">Acceptance criteria</Label>
                <textarea id="ac" value={acceptanceCriteria} onChange={(e) => setAcceptanceCriteria(e.target.value)} rows={3} placeholder="Given / When / Then…" className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {type === "Story" && (
                <div className="space-y-2">
                  <Label>Story points</Label>
                  <select value={points} onChange={(e) => setPoints(Number(e.target.value))} className={selectCls}>
                    <option value={0}>None</option>
                    {POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Sprint</Label>
                <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className={selectCls}>
                  <option value="">Backlog</option>
                  {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "Active" ? " (active)" : ""}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignee">Assignee</Label>
                <Input id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Name or email" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="labels">Labels</Label>
                <Input id="labels" value={labelsText} onChange={(e) => setLabelsText(e.target.value)} placeholder="ui, api, regression (comma separated)" />
              </div>
            </div>

            {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="min-w-32">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Create ${type.toLowerCase()}`}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function TypeCard({ active, onClick, icon: Icon, accent, title, desc }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; accent: "emerald" | "sky"; title: string; desc: string }) {
  const ring = accent === "emerald" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
  const ic = accent === "emerald" ? "text-emerald-600" : "text-sky-600"
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left transition-all ${active ? ring + " shadow-md" : "border-input hover:border-muted-foreground/40 hover:bg-accent/30"}`}>
      <div className="font-black text-sm flex items-center gap-2"><Icon className={`h-4 w-4 ${active ? ic : "text-muted-foreground"}`} /> {title}</div>
      <p className="text-[11px] text-muted-foreground mt-1">{desc}</p>
    </button>
  )
}
