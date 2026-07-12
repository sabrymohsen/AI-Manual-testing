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
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
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
    <Sheet open={!!openTaskId} onOpenChange={(o) => !o && closeTask()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[900px] xl:max-w-[1040px]">
        <SheetTitle className="sr-only">{task?.key ?? "Task"} details</SheetTitle>
        <SheetDescription className="sr-only">Task detail view</SheetDescription>
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
      </SheetContent>
    </Sheet>
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
    if (!currentUser || assignedToMe) return
    save({ assigneeIds: [...task.assignees.map((a) => a.id), currentUser.id] })
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
      {/* ── Header (sticky) ── */}
      <div className="sticky top-0 z-10 space-y-3 border-b bg-background px-6 pb-4 pt-5 pr-12">
        <div className="flex items-center gap-2">
          <TypeGlyph task={task} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={copyKey} className="flex items-center gap-1 font-mono text-sm font-semibold text-muted-foreground hover:text-foreground">
                {task.key}
                <Copy className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy issue key</TooltipContent>
          </Tooltip>

          <StatusPill status={task.status} onChange={(s) => save({ status: s })} />

          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Actions">
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

        {/* Title */}
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
            className="cursor-text rounded px-1 text-xl font-semibold leading-snug text-foreground hover:bg-muted/60"
          >
            {task.title}
          </h2>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MiniAvatar member={task.reporter} />
          <span>
            {task.reporter ? (
              <>Reported by <span className="font-medium text-foreground">{task.reporter.name || task.reporter.email}</span> · </>
            ) : null}
            created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })} · updated{" "}
            {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* ── Body (scrolls) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
          {/* Left column */}
          <div className="min-w-0 space-y-6">
            <DescriptionBlock task={task} onSave={save} />
            <div className="border-t pt-5">
              <SubtaskList projectId={projectId} taskId={task.id} subtasks={task.subtasks} />
            </div>
            <div className="border-t pt-5">
              <TaskLinkedIssues projectId={projectId} task={task} />
            </div>
            <div className="border-t pt-5">
              <TraceabilityLinks projectId={projectId} taskId={task.id} testCases={task.testCases ?? []} bugs={task.bugs ?? []} />
            </div>
            <div className="border-t pt-5">
              <TaskLinkedBrds projectId={projectId} taskId={task.id} />
            </div>
            <div className="border-t pt-5">
              <CommentList projectId={projectId} taskId={task.id} comments={task.comments ?? []} />
            </div>
            <div className="border-t pt-5">
              <TaskActivity activities={task.activities ?? []} />
            </div>
          </div>

          {/* Right column */}
          <div className="min-w-0">
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
      </div>

      {/* ── Footer action bar (sticky) ── */}
      <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t bg-background px-6 py-3">
        {transition && (
          <Button size="sm" onClick={() => save({ status: transition.next })}>
            {transition.label}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={assignToMe} disabled={assignedToMe}>
          <UserPlus className="mr-1.5 h-4 w-4" /> {assignedToMe ? "Assigned to you" : "Assign to me"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              More <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-44">
            <DropdownMenuItem onClick={() => clone.mutate()}>
              <CopyPlus className="mr-2 h-4 w-4" /> Clone
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => watch.mutate()}>
              <Eye className="mr-2 h-4 w-4" /> {watching ? "Unwatch" : "Watch"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => vote.mutate()}>
              <ThumbsUp className="mr-2 h-4 w-4" /> {voted ? "Remove vote" : "Vote"}
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
    </TooltipProvider>
  )
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
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
            sc.bg,
            sc.text,
            sc.border
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
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
      className="w-full resize-none rounded-md border border-input px-2 py-1 text-xl font-semibold leading-snug focus:outline-none focus:ring-2 focus:ring-ring"
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
  const [draft, setDraft] = useState(task.description ?? "")

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
      setDraft(task.description ?? "")
      setEditing(true)
    }
    window.addEventListener("scrum:edit-description", onEdit)
    return () => window.removeEventListener("scrum:edit-description", onEdit)
  }, [task.description])

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Description
      </h4>
      {editing ? (
        <div className="space-y-2">
          <RichTextEditor value={draft} onChange={setDraft} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveDescription} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <span className="text-[11px] text-muted-foreground">Tip: use the toolbar for size, lists, links &amp; more.</span>
          </div>
        </div>
      ) : task.description && task.description.replace(/<[^>]*>/g, "").trim() ? (
        <div
          onClick={() => { setDraft(task.description ?? ""); setEditing(true) }}
          className="rte-content max-w-none cursor-text rounded-md border border-transparent px-2 py-1.5 hover:border-input"
          dangerouslySetInnerHTML={{ __html: task.description }}
        />
      ) : (
        <button
          onClick={() => { setDraft(""); setEditing(true) }}
          className="w-full rounded-md border border-dashed border-input px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50"
        >
          Add a description…
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
