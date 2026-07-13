"use client"

import { useMemo, useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import type { ScrumTask, ScrumSprint, TaskFilters } from "@/types/scrum"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useScrumTasks, useScrumSprints, useMoveTask, useSprintMutations } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { PriorityBadge, STATUS_META, AvatarStack } from "@/components/scrum/shared"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, ChevronRight, Plus, Zap, Inbox, Layers, Play, CheckCircle2, Loader2, ArrowRight, Trash2, X } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const BACKLOG_ID = "backlog"

const SPRINT_STATUS: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: "Planned", cls: "bg-slate-100 text-slate-600" },
  ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  COMPLETED: { label: "Completed", cls: "bg-blue-100 text-blue-700" },
}

/**
 * Jira-style Backlog: every sprint (with its stories) plus the unscheduled
 * Backlog. Drag a story between the backlog and any sprint to plan it — the
 * move optimistically updates and persists the task's sprintId.
 */
export function BacklogView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const { data: tasks, isLoading } = useScrumTasks(projectId, filters)
  const { data: sprints } = useScrumSprints(projectId)
  const move = useMoveTask(projectId)
  const { update: updateSprint } = useSprintMutations(projectId)
  // Gate sprint controls on this project's own membership, decoupled from the
  // sidebar's "active project" (the global permission store can lag behind the
  // page's projectId on direct navigation). The API also enforces this on PATCH.
  const { data: membership } = useQuery({
    queryKey: ["project-membership", projectId],
    queryFn: () =>
      fetch(`/api/projects/${projectId}/membership`).then((r) => (r.ok ? r.json() : null)),
    staleTime: 60_000,
  })
  const canManageSprints =
    membership?.globalRole === "Admin" || membership?.permissions?.canCreateSprints === true
  const isAdmin = membership?.globalRole === "Admin"
  const canBulkMove = isAdmin || membership?.permissions?.canCreateStories === true
  const canBulkDelete = isAdmin || membership?.permissions?.canDeleteStories === true
  const { openTask, openCreateTask } = useScrumUI()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const qc = useQueryClient()

  const bulk = useMutation({
    mutationFn: async (body: { action: "move" | "delete"; taskIds: string[]; sprintId?: string | null }) => {
      const res = await fetch(`/api/projects/${projectId}/scrum/tasks/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Bulk action failed")
      return json as { affected: number }
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["scrum", projectId, "tasks"] })
      setSelected(new Set())
      toast.success(
        vars.action === "delete"
          ? `Deleted ${data.affected} ${data.affected === 1 ? "issue" : "issues"}`
          : `Moved ${data.affected} ${data.affected === 1 ? "issue" : "issues"}`
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  function bulkMove(sprintId: string | null) {
    bulk.mutate({ action: "move", taskIds: [...selected], sprintId })
  }

  function bulkDelete() {
    if (!window.confirm(`Delete ${selected.size} ${selected.size === 1 ? "issue" : "issues"}? This can't be undone.`)) return
    bulk.mutate({ action: "delete", taskIds: [...selected] })
  }

  function startSprint(s: ScrumSprint) {
    updateSprint.mutate(
      { sprintId: s.id, body: { status: "ACTIVE" } },
      {
        onSuccess: () => toast.success(`${s.name} started`),
        onError: () => toast.error("Failed to start sprint"),
      }
    )
  }

  function completeSprint(s: ScrumSprint) {
    updateSprint.mutate(
      { sprintId: s.id, body: { status: "COMPLETED" } },
      {
        onSuccess: () => toast.success(`${s.name} completed`),
        onError: () => toast.error("Failed to complete sprint"),
      }
    )
  }

  const groups = useMemo(() => {
    const bySprint = new Map<string, ScrumTask[]>()
    bySprint.set(BACKLOG_ID, [])
    for (const s of sprints ?? []) bySprint.set(s.id, [])
    for (const t of tasks ?? []) {
      const key = t.sprintId && bySprint.has(t.sprintId) ? t.sprintId : BACKLOG_ID
      bySprint.get(key)!.push(t)
    }
    for (const list of bySprint.values()) list.sort((a, b) => a.boardRank - b.boardRank)
    return bySprint
  }, [tasks, sprints])

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const destId = destination.droppableId
    const destList = (groups.get(destId) ?? []).filter((t) => t.id !== draggableId)
    const above = destList[destination.index - 1]?.boardRank
    const below = destList[destination.index]?.boardRank
    const newRank =
      above != null && below != null ? (above + below) / 2
      : above != null ? above + 1
      : below != null ? below - 1
      : 0

    move.mutate({
      taskId: draggableId,
      body: { sprintId: destId === BACKLOG_ID ? null : destId, boardRank: newRank },
    })
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />

  const orderedSprints = [...(sprints ?? [])].sort((a, b) => {
    const rank = (s: ScrumSprint) => (s.status === "ACTIVE" ? 0 : s.status === "PLANNED" ? 1 : 2)
    return rank(a) - rank(b)
  })
  const backlogList = groups.get(BACKLOG_ID) ?? []

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="h-full overflow-y-auto">
        <div className="w-full space-y-4 pb-6">
        {orderedSprints.map((s) => (
          <Section
            key={s.id}
            id={s.id}
            title={s.name}
            icon={<Zap className="h-4 w-4 text-amber-500" />}
            subtitle={
              s.startDate && s.endDate
                ? `${format(new Date(s.startDate), "MMM d")} – ${format(new Date(s.endDate), "MMM d")}`
                : s.goal || undefined
            }
            badge={SPRINT_STATUS[s.status]}
            tasks={groups.get(s.id) ?? []}
            collapsed={collapsed.has(s.id)}
            onToggle={() => toggle(s.id)}
            onOpenTask={openTask}
            onCreate={() => openCreateTask(undefined, s.id)}
            emptyText="Drag stories here to plan this sprint."
            onStart={canManageSprints && s.status === "PLANNED" ? () => startSprint(s) : undefined}
            onComplete={canManageSprints && s.status === "ACTIVE" ? () => completeSprint(s) : undefined}
            sprintBusy={updateSprint.isPending}
            selected={selected}
            onToggleSelect={canBulkMove || canBulkDelete ? toggleSelect : undefined}
          />
        ))}

        <Section
          id={BACKLOG_ID}
          title="Backlog"
          icon={<Inbox className="h-4 w-4 text-slate-500" />}
          subtitle="Unscheduled user stories"
          tasks={backlogList}
          collapsed={collapsed.has(BACKLOG_ID)}
          onToggle={() => toggle(BACKLOG_ID)}
          onOpenTask={openTask}
          onCreate={() => openCreateTask()}
          emptyText="No stories in the backlog."
          selected={selected}
          onToggleSelect={canBulkMove || canBulkDelete ? toggleSelect : undefined}
        />
        </div>
      </div>

      {/* Floating bulk-action bar */}
      {selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xl">
            <span className="text-xs font-bold">{selected.size} selected</span>
            {canBulkMove && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={bulk.isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                  >
                    {bulk.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    Move to
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48">
                  <DropdownMenuItem onClick={() => bulkMove(null)} className="gap-2">
                    <Inbox className="h-4 w-4 text-slate-500" /> Backlog
                  </DropdownMenuItem>
                  {orderedSprints
                    .filter((s) => s.status !== "COMPLETED")
                    .map((s) => (
                      <DropdownMenuItem key={s.id} onClick={() => bulkMove(s.id)} className="gap-2">
                        <Zap className="h-4 w-4 text-amber-500" /> {s.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canBulkDelete && (
              <button
                onClick={bulkDelete}
                disabled={bulk.isPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </div>
      )}
    </DragDropContext>
  )
}

function Section({
  id,
  title,
  subtitle,
  icon,
  badge,
  tasks,
  collapsed,
  onToggle,
  onOpenTask,
  onCreate,
  emptyText,
  onStart,
  onComplete,
  sprintBusy,
  selected,
  onToggleSelect,
}: {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  badge?: { label: string; cls: string }
  tasks: ScrumTask[]
  collapsed: boolean
  onToggle: () => void
  onOpenTask: (id: string) => void
  onCreate: () => void
  emptyText: string
  onStart?: () => void
  onComplete?: () => void
  sprintBusy?: boolean
  selected: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const points = tasks.reduce((a, t) => a + (t.storyPoints || 0), 0)
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id))
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
        <button onClick={onToggle} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {onToggleSelect && (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))]"
            checked={allSelected}
            disabled={tasks.length === 0}
            onChange={() => tasks.forEach((t) => (allSelected === selected.has(t.id)) && onToggleSelect(t.id))}
            title={allSelected ? "Deselect all in this section" : "Select all in this section"}
          />
        )}
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        {badge && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>{badge.label}</span>}
        {subtitle && <span className="hidden text-[11px] text-muted-foreground sm:inline">· {subtitle}</span>}
        <div className="ml-auto flex items-center gap-2">
          {points > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary" title="Total story points">
              {points} pts
            </span>
          )}
          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {tasks.length}
          </span>
          {onStart && (
            <button
              onClick={onStart}
              disabled={sprintBusy}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              title="Start this sprint"
            >
              {sprintBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start sprint
            </button>
          )}
          {onComplete && (
            <button
              onClick={onComplete}
              disabled={sprintBusy}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              title="Complete this sprint"
            >
              {sprintBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              Complete
            </button>
          )}
          <button
            onClick={onCreate}
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            title="Add story"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <Droppable droppableId={id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "min-h-[48px] divide-y divide-border/60 transition-colors",
                snapshot.isDraggingOver && "bg-primary/5"
              )}
            >
              {tasks.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(dp, ds) => (
                    <div
                      ref={dp.innerRef}
                      {...dp.draggableProps}
                      {...(dp.dragHandleProps as any)}
                      className={cn("bg-card", ds.isDragging && "rounded-lg shadow-lg ring-1 ring-primary/30")}
                    >
                      <BacklogRow
                        task={task}
                        onClick={() => onOpenTask(task.id)}
                        checked={selected.has(task.id)}
                        onToggleSelect={onToggleSelect}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              {tasks.length === 0 && !snapshot.isDraggingOver && (
                <div className="px-4 py-5 text-center text-xs text-muted-foreground">{emptyText}</div>
              )}
            </div>
          )}
        </Droppable>
      )}
    </div>
  )
}

function BacklogRow({
  task,
  onClick,
  checked,
  onToggleSelect,
}: {
  task: ScrumTask
  onClick: () => void
  checked: boolean
  onToggleSelect?: (id: string) => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50", checked && "bg-primary/5")}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[hsl(var(--primary))]"
          checked={checked}
          onChange={() => onToggleSelect(task.id)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[task.status].dot)} title={STATUS_META[task.status].label} />
      <span className="font-mono text-[11px] font-bold text-primary">{task.key}</span>
      <span className="flex-1 truncate text-sm">{task.title}</span>
      {task.epic && (
        <span
          className="hidden items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold md:inline-flex"
          style={{ backgroundColor: `${task.epic.color}1a`, color: task.epic.color }}
          title={task.epic.title}
        >
          <Layers className="h-2.5 w-2.5" /> {task.epic.title}
        </span>
      )}
      <PriorityBadge priority={task.priority} />
      {task.storyPoints != null && (
        <span className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground sm:inline-flex">
          {task.storyPoints}
        </span>
      )}
      {task.assignees.length > 0 && <AvatarStack members={task.assignees} max={2} />}
    </div>
  )
}
