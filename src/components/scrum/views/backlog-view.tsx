"use client"

import { useMemo, useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import type { ScrumTask, ScrumSprint, TaskFilters } from "@/types/scrum"
import { useScrumTasks, useScrumSprints, useMoveTask } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { PriorityBadge, STATUS_META, AvatarStack } from "@/components/scrum/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronDown, ChevronRight, Plus, Zap, Inbox, Layers } from "lucide-react"
import { format } from "date-fns"
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
  const { openTask, openCreateTask } = useScrumUI()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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
        />
        </div>
      </div>
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
}) {
  const points = tasks.reduce((a, t) => a + (t.storyPoints || 0), 0)
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
        <button onClick={onToggle} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
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
                      <BacklogRow task={task} onClick={() => onOpenTask(task.id)} />
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

function BacklogRow({ task, onClick }: { task: ScrumTask; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
    >
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
