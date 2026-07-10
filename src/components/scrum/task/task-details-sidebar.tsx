"use client"

import { useEffect, useRef, useState } from "react"
import type { ScrumTask, ScrumMember } from "@/types/scrum"
import { useTaskDetailMutations, useScrumLabels, type CurrentUser } from "@/hooks/scrum/use-scrum"
import {
  STATUS_COLORS,
  TASK_TYPES,
  TYPE_META,
  PRIORITY_ORDER,
  STORY_POINT_OPTIONS,
  formatMinutes,
  formatBytes,
  parseTimeToMinutes,
} from "./task-detail-config"
import { PRIORITY_META } from "@/components/scrum/shared"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { AvatarStack } from "@/components/scrum/shared"
import {
  ArrowUp,
  ArrowDown,
  Users,
  Tag,
  X,
  Plus,
  Clock,
  Paperclip,
  Eye,
  Upload,
  Trash2,
  FileText,
  Download,
  AlertTriangle,
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

type SaveFn = (body: Record<string, unknown>) => void

export function TaskDetailsSidebar({
  projectId,
  task,
  members,
  sprints,
  epics,
  currentUser,
  onSave,
}: {
  projectId: string
  task: ScrumTask
  members: ScrumMember[]
  sprints: { id: string; name: string }[]
  epics: { id: string; title: string; color: string }[]
  currentUser: CurrentUser | undefined
  onSave: SaveFn
}) {
  return (
    <div className="space-y-6">
      <DetailsPanel
        projectId={projectId}
        task={task}
        members={members}
        sprints={sprints}
        epics={epics}
        onSave={onSave}
      />
      <Divider />
      <DatesPanel task={task} onSave={onSave} />
      <Divider />
      <TimeTrackingPanel projectId={projectId} task={task} />
      <Divider />
      <AttachmentsPanel projectId={projectId} task={task} />
      <Divider />
      <WatchersPanel projectId={projectId} task={task} members={members} currentUser={currentUser} />
    </div>
  )
}

function Divider() {
  return <div className="border-t border-border" />
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {children}
    </h4>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2 py-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ── Details ────────────────────────────────────────────────────────────────

function DetailsPanel({
  projectId,
  task,
  members,
  sprints,
  epics,
  onSave,
}: {
  projectId: string
  task: ScrumTask
  members: ScrumMember[]
  sprints: { id: string; name: string }[]
  epics: { id: string; title: string; color: string }[]
  onSave: SaveFn
}) {
  return (
    <div>
      <SectionTitle icon={Tag}>Details</SectionTitle>
      <div className="rounded-lg border border-border p-3">
        <Row label="Type">
          <Select value={task.type} onValueChange={(v) => onSave({ type: v })}>
            <SelectTrigger className="h-8 border-transparent px-2 hover:border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map((t) => {
                const Icon = TYPE_META[t].icon
                return (
                  <SelectItem key={t} value={t}>
                    <span className="flex items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5", TYPE_META[t].color)} /> {TYPE_META[t].label}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Assignee">
          <AssigneePicker task={task} members={members} onSave={onSave} />
        </Row>

        <Row label="Reporter">
          <Select value={task.reporterId ?? "none"} onValueChange={(v) => onSave({ reporterId: v === "none" ? null : v })}>
            <SelectTrigger className="h-8 border-transparent px-2 hover:border-input">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name || m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Priority">
          <Select value={task.priority} onValueChange={(v) => onSave({ priority: v })}>
            <SelectTrigger className="h-8 border-transparent px-2 hover:border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_ORDER.map((p) => {
                const meta = PRIORITY_META[p]
                const Icon = meta.dir === "up" ? ArrowUp : ArrowDown
                return (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5", meta.dir === "up" ? "text-red-500" : "text-emerald-500")} />
                      {meta.label}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Story pts">
          <Select
            value={task.storyPoints != null ? String(task.storyPoints) : "none"}
            onValueChange={(v) => onSave({ storyPoints: v === "none" ? null : Number(v) })}
          >
            <SelectTrigger className="h-8 border-transparent px-2 hover:border-input">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {STORY_POINT_OPTIONS.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Sprint">
          <Select value={task.sprintId ?? "none"} onValueChange={(v) => onSave({ sprintId: v === "none" ? null : v })}>
            <SelectTrigger className="h-8 border-transparent px-2 hover:border-input">
              <SelectValue placeholder="No sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No sprint</SelectItem>
              {sprints.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Epic">
          <Select value={task.epicId ?? "none"} onValueChange={(v) => onSave({ epicId: v === "none" ? null : v })}>
            <SelectTrigger className="h-8 border-transparent px-2 hover:border-input">
              <SelectValue placeholder="No epic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No epic</SelectItem>
              {epics.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} /> {e.title}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Labels">
          <TagInput
            projectId={projectId}
            values={task.labels}
            onChange={(labels) => onSave({ labels })}
            placeholder="Add label…"
          />
        </Row>

        <Row label="Components">
          <TagInput
            projectId={projectId}
            values={task.components}
            field="components"
            onChange={(components) => onSave({ components })}
            placeholder="Add component…"
          />
        </Row>

        <Row label="Env">
          <InlineText value={task.environment ?? ""} onSave={(v) => onSave({ environment: v || null })} placeholder="e.g. Production" />
        </Row>
      </div>
    </div>
  )
}

function AssigneePicker({ task, members, onSave }: { task: ScrumTask; members: ScrumMember[]; onSave: SaveFn }) {
  const assigneeIds = task.assignees.map((a) => a.id)
  const assigned = members.filter((m) => assigneeIds.includes(m.id))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-2 text-sm hover:border-input">
          {assigned.length ? (
            <>
              <AvatarStack members={assigned} max={3} />
              <span className="truncate text-xs">{assigned.length === 1 ? assigned[0].name || assigned[0].email : `${assigned.length} people`}</span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Unassigned
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {members.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No members.</p>}
        {members.map((m) => {
          const on = assigneeIds.includes(m.id)
          return (
            <button
              key={m.id}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                const next = on ? assigneeIds.filter((id) => id !== m.id) : [...assigneeIds, m.id]
                onSave({ assigneeIds: next })
              }}
            >
              <input type="checkbox" checked={on} readOnly className="h-4 w-4 accent-primary" />
              <span className="flex-1 text-left">{m.name || m.email}</span>
              {m.role && <span className="text-[10px] text-muted-foreground">{m.role}</span>}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function InlineText({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value)
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      placeholder={placeholder}
      className="h-8 border-transparent px-2 text-sm hover:border-input focus:border-input"
    />
  )
}

function TagInput({
  projectId,
  values,
  onChange,
  placeholder,
  field = "labels",
}: {
  projectId: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  field?: "labels" | "components"
}) {
  const [draft, setDraft] = useState("")
  const { data } = useScrumLabels(projectId)
  const suggestions = (field === "components" ? data?.components : data?.labels) ?? []
  const add = (raw: string) => {
    const v = raw.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft("")
  }
  const filtered = draft ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()) && !values.includes(s)) : []

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-transparent px-1 py-0.5 hover:border-input">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))} className="hover:text-red-600">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <Popover open={filtered.length > 0}>
        <PopoverTrigger asChild>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add(draft)
              } else if (e.key === "Backspace" && !draft && values.length) {
                onChange(values.slice(0, -1))
              }
            }}
            placeholder={values.length ? "" : placeholder}
            className="min-w-[60px] flex-1 bg-transparent px-1 py-0.5 text-xs focus:outline-none"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
          {filtered.slice(0, 8).map((s) => (
            <button key={s} onClick={() => add(s)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted">
              {s}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Dates ──────────────────────────────────────────────────────────────────

function DatesPanel({ task, onSave }: { task: ScrumTask; onSave: SaveFn }) {
  const [due, setDue] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "")
  const overdue =
    task.dueDate && task.status !== "DONE" && task.status !== "DEPLOYED" && new Date(task.dueDate) < new Date()
  return (
    <div>
      <SectionTitle icon={Clock}>Dates</SectionTitle>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Created</span>
          <span>{format(new Date(task.createdAt), "MMM d, yyyy")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Updated</span>
          <span>{format(new Date(task.updatedAt), "MMM d, yyyy")}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-muted-foreground", overdue && "text-red-600")}>Due</span>
          <div className="flex items-center gap-1">
            {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={() => onSave({ dueDate: due ? new Date(due).toISOString() : null })}
              className={cn("h-7 w-36 px-2 text-xs", overdue && "border-red-300 text-red-600")}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Time tracking ────────────────────────────────────────────────────────────

function TimeTrackingPanel({ projectId, task }: { projectId: string; task: ScrumTask }) {
  const [open, setOpen] = useState(false)
  // Respond to the drawer's "L" keyboard shortcut.
  useEffect(() => {
    const onLog = () => setOpen(true)
    window.addEventListener("scrum:log-work", onLog)
    return () => window.removeEventListener("scrum:log-work", onLog)
  }, [])
  const logged = task.timeSpent ?? 0
  const remaining = task.remainingEstimate ?? 0
  const estimate = task.originalEstimate ?? logged + remaining
  const denom = Math.max(estimate, logged, 1)
  const loggedPct = Math.min(100, (logged / denom) * 100)
  const exceeded = logged > estimate && estimate > 0

  return (
    <div>
      <SectionTitle icon={Clock}>Time Tracking</SectionTitle>
      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div className={cn("h-full rounded-full", exceeded ? "bg-red-500" : "bg-blue-500")} style={{ width: `${loggedPct}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{formatMinutes(logged)} logged</span>
          <span>{formatMinutes(remaining)} remaining</span>
          <span>{formatMinutes(estimate)} est.</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Log work
        </button>
      </div>
      <LogWorkDialog projectId={projectId} task={task} open={open} onOpenChange={setOpen} />
    </div>
  )
}

function LogWorkDialog({
  projectId,
  task,
  open,
  onOpenChange,
}: {
  projectId: string
  task: ScrumTask
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { logWork } = useTaskDetailMutations(projectId, task.id)
  const [time, setTime] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [desc, setDesc] = useState("")
  const minutes = parseTimeToMinutes(time)

  const submit = () => {
    if (!minutes) return
    logWork.mutate(
      { timeSpent: minutes, description: desc || null, startedAt: new Date(date).toISOString() },
      { onSuccess: () => { onOpenChange(false); setTime(""); setDesc("") } }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log work</DialogTitle>
          <DialogDescription>Record time spent on {task.key}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Time spent</label>
            <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 1h 30m, 90m, 1.5h" autoFocus />
            <p className="text-[11px] text-muted-foreground">
              {time ? (minutes ? `= ${formatMinutes(minutes)}` : "Unrecognized format") : "Use w / d / h / m units."}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Date started</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Description</label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="What did you work on?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!minutes || logWork.isPending}>
            Log work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Attachments ──────────────────────────────────────────────────────────────

function AttachmentsPanel({ projectId, task }: { projectId: string; task: ScrumTask }) {
  const { uploadAttachment, deleteAttachment } = useTaskDetailMutations(projectId, task.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const attachments = task.attachments ?? []

  const upload = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      setProgress(0)
      uploadAttachment.mutate(
        { file, onProgress: setProgress },
        { onSettled: () => setProgress(null) }
      )
    })
  }

  return (
    <div>
      <SectionTitle icon={Paperclip}>
        Attachments {attachments.length > 0 && <span className="text-foreground">({attachments.length})</span>}
      </SectionTitle>

      <div className="space-y-2">
        {attachments.map((a) => {
          const isImage = a.mimeType.startsWith("image/")
          return (
            <div key={a.id} className="group flex items-center gap-2 rounded-md border border-border p-1.5">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt={a.name}
                  onClick={() => setPreview(a.url)}
                  className="h-10 w-10 cursor-pointer rounded object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{a.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(a.size)}</p>
              </div>
              <a href={a.url} download={a.name} className="text-muted-foreground hover:text-foreground" title="Download">
                <Download className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => {
                  if (confirm(`Delete ${a.name}?`)) deleteAttachment.mutate(a.id)
                }}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            upload(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-input px-3 py-4 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/50",
            dragOver && "border-primary bg-primary/5"
          )}
        >
          <Upload className="h-4 w-4" />
          {progress != null ? `Uploading… ${progress}%` : "Drop a file or click to attach (max 10 MB)"}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}

// ── Watchers ─────────────────────────────────────────────────────────────────

function WatchersPanel({
  projectId,
  task,
  members,
  currentUser,
}: {
  projectId: string
  task: ScrumTask
  members: ScrumMember[]
  currentUser: CurrentUser | undefined
}) {
  const { watch } = useTaskDetailMutations(projectId, task.id)
  const watchers = task.watchers ?? []
  const watching = !!currentUser && watchers.some((w) => w.id === currentUser.id)

  return (
    <div>
      <SectionTitle icon={Eye}>
        Watchers {watchers.length > 0 && <span className="text-foreground">({watchers.length})</span>}
      </SectionTitle>
      <div className="flex items-center gap-2">
        {watchers.length > 0 ? (
          <AvatarStack members={watchers} max={5} />
        ) : (
          <span className="text-xs text-muted-foreground">No watchers yet.</span>
        )}
        <button
          onClick={() => watch.mutate()}
          disabled={watch.isPending}
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold",
            watching ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"
          )}
        >
          <Eye className="h-3 w-3" /> {watching ? "Watching" : "Watch"}
        </button>
      </div>
    </div>
  )
}
