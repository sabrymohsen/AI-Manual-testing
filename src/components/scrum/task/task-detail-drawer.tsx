"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useScrumUI } from "@/stores/scrum-ui"
import {
  useScrumTask,
  useUpdateTask,
  useDeleteTask,
  useScrumMembers,
  useScrumSprints,
  useScrumEpics,
  useCurrentUser,
  useTaskDetailMutations,
} from "@/hooks/scrum/use-scrum"
import type { ScrumTask, ScrumMember, TaskStatus } from "@/types/scrum"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RichTextEditor } from "./rich-text-editor"
import { SubtaskList } from "./subtask-list"
import { CommentList } from "./comment-list"
import { TraceabilityLinks } from "./traceability-links"
import { TaskLinkedIssues } from "./task-linked-issues"
import { TaskDetailsSidebar } from "./task-details-sidebar"
import { TaskLinkedBrds } from "./task-linked-brds"
import { LinkedEntities } from "@/components/entity-links/linked-entities"
import { TaskActivity } from "./task-activity"
import { STATUS_COLORS, STATUS_ORDER, TYPE_META } from "./task-detail-config"
import { PermissionGate } from "@/components/permissions/PermissionGate"
import { initials } from "@/components/scrum/shared"
import {
  Copy,
  MoreHorizontal,
  Check,
  ChevronDown,
  FileText,
  Pencil,
  UserPlus,
  Eye,
  ThumbsUp,
  Link as LinkIcon,
  Trash2,
  CopyPlus,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

/** Next status in the simplified workflow, used by the footer transition button. */
const NEXT_STATUS: Partial<Record<TaskStatus, { next: TaskStatus; label: string }>> = {
  TODO: { next: "IN_PROGRESS", label: "Start progress" },
  IN_PROGRESS: { next: "REVIEW", label: "Ready for review" },
  REVIEW: { next: "TESTING", label: "Move to testing" },
  TESTING: { next: "DONE", label: "Mark as done" },
  DEPLOYED: { next: "DONE", label: "Mark as done" },
}

export function TaskDrawer({ projectId }: { projectId: string }) {
  const { openTaskId, openTask, closeTask } = useScrumUI()
  const { data: task, isLoading } = useScrumTask(openTaskId)
  const router = useRouter()
  const search = useSearchParams()

  // ── URL sync (?task=<id>) for shareable deep links ──
  const syncedRef = useRef(false)
  // On first mount, open the task named in the URL.
  useEffect(() => {
    if (syncedRef.current) return
    syncedRef.current = true
    const urlTask = search.get("task")
    if (urlTask && !openTaskId) openTask(urlTask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Mirror the open task into the URL.
  useEffect(() => {
    const current = new URLSearchParams(search.toString())
    if (openTaskId && current.get("task") !== openTaskId) {
      current.set("task", openTaskId)
      router.replace(`?${current.toString()}`, { scroll: false })
    } else if (!openTaskId && current.has("task")) {
      current.delete("task")
      router.replace(`?${current.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaskId])

  return (
    <Dialog open={!!openTaskId} onOpenChange={(o) => !o && closeTask()}>
      <DialogContent className="sm:max-w-[1100px] w-[95vw] max-h-[90vh] h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border shadow-2xl bg-background border-border">
        <DialogTitle className="sr-only">{task?.key ?? "Task"} details</DialogTitle>
        <DialogDescription className="sr-only">Task detail view</DialogDescription>
        {isLoading || !task ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <DrawerBody key={task.id} task={task} projectId={projectId} onClose={closeTask} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DrawerBody({ task, projectId, onClose }: { task: ScrumTask; projectId: string; onClose: () => void }) {
  const { data: members } = useScrumMembers(projectId)
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)
  const { data: currentUser } = useCurrentUser()
  const update = useUpdateTask(projectId)
  const del = useDeleteTask(projectId)
  const { clone, watch, vote } = useTaskDetailMutations(projectId, task.id)

  const [editingTitle, setEditingTitle] = useState(false)

  const save = useCallback(
    (body: Record<string, unknown>, opts?: { onSuccess?: () => void }) =>
      update.mutate({ taskId: task.id, body }, opts),
    [update, task.id]
  )

  // Keyboard shortcuts: E = edit title, Shift+C = comment, L = log work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return
      if (e.key === "e" || e.key === "E") {
        e.preventDefault()
        setEditingTitle(true)
      } else if (e.key === "c" && e.shiftKey) {
        e.preventDefault()
        document.getElementById("scrum-comment-input")?.focus()
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("scrum:log-work"))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const watching = !!currentUser && (task.watchers ?? []).some((w) => w.id === currentUser.id)
  const voted = !!currentUser && (task.votedByIds ?? []).includes(currentUser.id)
  const assignedToMe = !!currentUser && task.assignees.some((a) => a.id === currentUser.id)

  const assignToMe = () => {
    if (!currentUser) return
    const currentIds = (task.assignees ?? []).map((a) => a.id)
    const isAssigned = currentIds.includes(currentUser.id)
    const next = isAssigned ? currentIds.filter((id) => id !== currentUser.id) : [...currentIds, currentUser.id]
    save({ assigneeIds: next })
  }

  const doDelete = () => {
    if (confirm("Delete this task? This cannot be undone.")) del.mutate(task.id, { onSuccess: onClose })
  }

  const copyKey = () => {
    navigator.clipboard.writeText(task.key)
    toast.success("Issue key copied")
  }
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?task=${task.id}`)
    toast.success("Link copied")
  }

  const transition = NEXT_STATUS[task.status]

  return (
    <TooltipProvider delayDuration={200}>
      {/* ── Top Bar Header (Theme Unified) ── */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3.5 bg-card/60 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <TypeGlyph task={task} />
          
          <button
            onClick={copyKey}
            className="flex items-center gap-1 font-mono text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/50 transition-all"
          >
            <span>{task.key}</span>
            <Copy className="h-3 w-3" />
          </button>

          <StatusPill status={task.status} onChange={(s) => save({ status: s })} />
        </div>

        <div className="flex items-center gap-2 pr-8">
          {transition && (
            <Button size="sm" onClick={() => save({ status: transition.next })} className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3">
              {transition.label}
            </Button>
          )}

          <Button size="sm" variant="outline" onClick={assignToMe} disabled={assignedToMe} className="h-8 text-xs rounded-lg font-semibold px-2.5">
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> {assignedToMe ? "Assigned" : "Assign me"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-all" title="More Actions">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditingTitle(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit title
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => clone.mutate()}>
                <CopyPlus className="mr-2 h-4 w-4" /> Clone
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => watch.mutate()}>
                <Eye className="mr-2 h-4 w-4" /> {watching ? "Unwatch" : "Watch"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => vote.mutate()}>
                <ThumbsUp className="mr-2 h-4 w-4" /> {voted ? "Remove vote" : "Vote"} ({task.votes})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyLink}>
                <LinkIcon className="mr-2 h-4 w-4" /> Copy link
              </DropdownMenuItem>
              <PermissionGate permission="canDeleteStories">
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doDelete} className="text-red-600 focus:text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Main Content & Property Sidebar (Split View) ── */}
      <div className="flex-1 grid grid-cols-[1fr_330px] divide-x divide-border min-h-0 overflow-hidden bg-background">
        {/* Left Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-6 min-w-0">
          {/* Issue Title */}
          <div>
            {editingTitle ? (
              <TitleEditor
                initial={task.title}
                onCancel={() => setEditingTitle(false)}
                onSave={(v) => {
                  if (v.trim() && v !== task.title) save({ title: v.trim() })
                  setEditingTitle(false)
                }}
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="cursor-pointer rounded-lg p-1 text-2xl font-bold tracking-tight text-foreground hover:bg-muted/50 transition-all leading-snug flex items-start justify-between group"
              >
                <span>{task.title}</span>
                <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0 ml-2 mt-1" />
              </h2>
            )}

            {/* Reporter Meta */}
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <MiniAvatar member={task.reporter} />
              <span>
                {task.reporter ? (
                  <>Reported by <span className="font-semibold text-foreground">{task.reporter.name || task.reporter.email}</span> • </>
                ) : null}
                created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })} • updated{" "}
                {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
              </span>
            </div>
          </div>

          <DescriptionBlock task={task} onSave={save} />
          
          <div className="border-t border-border/60 pt-5">
            <SubtaskList projectId={projectId} taskId={task.id} subtasks={task.subtasks} />
          </div>

          <div className="border-t border-border/60 pt-5">
            <TaskLinkedIssues projectId={projectId} task={task} />
          </div>

          <div className="border-t border-border/60 pt-5">
            <TraceabilityLinks projectId={projectId} taskId={task.id} testCases={task.testCases ?? []} bugs={task.bugs ?? []} />
          </div>

          <div className="border-t border-border/60 pt-5">
            <TaskLinkedBrds projectId={projectId} taskId={task.id} />
          </div>

          {/* Generic links: anything the purpose-built sections above don't cover. */}
          <div className="border-t border-border/60 pt-5">
            <LinkedEntities projectId={projectId} entityId={task.id} entityType="TASK" />
          </div>

          <div className="border-t border-border/60 pt-5">
            <CommentList projectId={projectId} taskId={task.id} comments={task.comments ?? []} />
          </div>

          <div className="border-t border-border/60 pt-5">
            <TaskActivity activities={task.activities ?? []} />
          </div>
        </div>

        {/* Right Property Sidebar */}
        <div className="overflow-y-auto p-5 bg-muted/15 space-y-6 min-w-0">
          <TaskDetailsSidebar
            projectId={projectId}
            task={task}
            members={(members as ScrumMember[]) ?? []}
            sprints={sprints ?? []}
            epics={epics ?? []}
            currentUser={currentUser}
            onSave={save}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

function formatDescriptionHtml(text: string): string {
  if (!text) return ""

  let html = text

  // 1. Unpack <p> tags wrapping markdown headers
  html = html.replace(/<p>\s*(#{1,3}\s+.*?)\s*<\/p>/gi, "$1")

  // 2. Convert markdown headers to styled HTML with accent badges
  html = html.replace(/(?:^|<p>)\s*###\s+(.*?)\s*(?:<\/p>|$)/gim, '<h3 class="text-sm font-extrabold tracking-tight text-foreground mt-5 mb-2 pb-1 border-b border-border/60 flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-indigo-500"></span>$1</h3>')
  html = html.replace(/(?:^|<p>)\s*##\s+(.*?)\s*(?:<\/p>|$)/gim, '<h2 class="text-base font-extrabold tracking-tight text-foreground mt-6 mb-2 pb-1 border-b border-border/60 flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full bg-purple-500"></span>$1</h2>')
  html = html.replace(/(?:^|<p>)\s*#\s+(.*?)\s*(?:<\/p>|$)/gim, '<h1 class="text-lg font-black tracking-tight text-foreground mt-6 mb-3 pb-1 border-b border-border flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-indigo-600"></span>$1</h1>')

  // 3. Convert inline markdown bold, italic, code
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-foreground">$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px] text-indigo-500 dark:text-indigo-400 font-bold">$1</code>')

  // 4. Convert bullet lists
  html = html.replace(/-\s+\[ \]\s+(.*$)/gim, '<div class="flex items-center gap-2 text-xs py-1"><input type="checkbox" disabled class="rounded" /> <span>$1</span></div>')
  html = html.replace(/-\s+\[x\]\s+(.*$)/gim, '<div class="flex items-center gap-2 text-xs py-1 text-emerald-600"><input type="checkbox" checked disabled class="rounded text-emerald-600" /> <span class="line-through">$1</span></div>')

  // 5. Convert newlines for plain text
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    html = html.replace(/\n/g, '<br />')
  }

  return html
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function TypeGlyph({ task }: { task: ScrumTask }) {
  const meta = TYPE_META[task.type] ?? TYPE_META.STORY
  const Icon = meta.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("flex h-6 w-6 items-center justify-center rounded", meta.color)}>
          <Icon className="h-4 w-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{meta.label}</TooltipContent>
    </Tooltip>
  )
}

function StatusPill({ status, onChange }: { status: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const sc = STATUS_COLORS[status]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-extrabold transition-all hover:scale-105 shadow-2xs",
            sc.bg,
            sc.text,
            sc.border
          )}
        >
          <span className={cn("h-2 w-2 rounded-full animate-pulse", sc.dot)} />
          {sc.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STATUS_ORDER.map((s) => {
          const meta = STATUS_COLORS[s]
          return (
            <DropdownMenuItem
              key={s}
              onClick={() => {
                if (s === status) return
                if (s === "DONE" && !confirm("Mark this issue as complete?")) return
                onChange(s)
              }}
            >
              <span className={cn("mr-2 h-2 w-2 rounded-full", meta.dot)} />
              {meta.label}
              {s === status && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TitleEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <textarea
      ref={ref}
      value={v}
      maxLength={200}
      rows={1}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          onSave(v)
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      className="w-full resize-none rounded-xl border border-input px-3 py-2 text-xl font-extrabold leading-snug focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

function DescriptionBlock({
  task,
  onSave,
}: {
  task: ScrumTask
  onSave: (body: Record<string, unknown>, opts?: { onSuccess?: () => void }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState("")

  const saveDescription = () => {
    setSaving(true)
    onSave(
      { description: draft },
      {
        onSuccess: () => {
          toast.success("Description saved")
          setSaving(false)
          setEditing(false)
        },
      }
    )
  }

  useEffect(() => {
    const onEdit = () => {
      setDraft(formatDescriptionHtml(task.description ?? ""))
      setEditing(true)
    }
    window.addEventListener("scrum:edit-description", onEdit)
    return () => window.removeEventListener("scrum:edit-description", onEdit)
  }, [task.description])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <FileText className="h-4 w-4 text-indigo-500" /> Description
        </h4>
        {!editing && (
          <button
            type="button"
            onClick={() => { setDraft(formatDescriptionHtml(task.description ?? "")); setEditing(true) }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <RichTextEditor value={draft} onChange={setDraft} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveDescription} disabled={saving} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? "Saving…" : "Save Description"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving} className="rounded-xl font-semibold">
              Cancel
            </Button>
            <span className="text-[11px] text-muted-foreground">Tip: Toolbar formats bold, lists, headers &amp; code.</span>
          </div>
        </div>
      ) : task.description && task.description.replace(/<[^>]*>/g, "").trim() ? (
        <div
          onClick={() => { setDraft(formatDescriptionHtml(task.description ?? "")); setEditing(true) }}
          className="rte-content max-w-none cursor-text rounded-xl border border-transparent p-3 hover:border-input/50 transition-all text-xs font-medium leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatDescriptionHtml(task.description) }}
        />
      ) : (
        <button
          onClick={() => { setDraft(""); setEditing(true) }}
          className="w-full rounded-2xl border border-dashed border-input p-4 text-left text-xs text-muted-foreground hover:bg-muted/50 transition-all font-medium flex items-center justify-between group"
        >
          <span>Add a detailed issue description, acceptance criteria, or context...</span>
          <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
        </button>
      )}
    </div>
  )
}

function MiniAvatar({ member }: { member: ScrumMember | null }) {
  if (!member) return null
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[9px] font-bold text-primary">
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatarUrl} alt={member.name || member.email} className="h-full w-full object-cover" />
      ) : (
        initials(member.name, member.email)
      )}
    </span>
  )
}
