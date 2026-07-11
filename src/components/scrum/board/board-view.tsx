"use client"

import { useMemo } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import type { ScrumTask, BoardColumn, TaskFilters } from "@/types/scrum"
import { useScrumTasks, useBoardColumns, useMoveTask, useColumnMutations, useScrumSprints } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { STATUS_META } from "@/components/scrum/shared"
import { TaskCard } from "./task-card"
import { CreateColumnButton } from "./create-column-button"
import { PermissionGate } from "@/components/permissions/PermissionGate"
import { Plus, MoreHorizontal, Trash2, Zap, Layers } from "lucide-react"
import { format } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function BoardView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const { data: tasks, isLoading } = useScrumTasks(projectId, filters)
  const { data: columns } = useBoardColumns(projectId)
  const { data: sprints } = useScrumSprints(projectId)
  const move = useMoveTask(projectId)
  const { openTask, openCreateTask } = useScrumUI()
  const { remove: removeColumn } = useColumnMutations(projectId)

  // The board shows only the ACTIVE sprint's stories (Jira-style sprint board).
  const activeSprint = useMemo(() => (sprints ?? []).find((s) => s.status === "ACTIVE") ?? null, [sprints])

  const sprintTasks = useMemo(
    () => (activeSprint ? (tasks ?? []).filter((t) => t.sprintId === activeSprint.id) : []),
    [tasks, activeSprint]
  )

  const byStatus = useMemo(() => {
    const map = new Map<string, ScrumTask[]>()
    for (const c of columns ?? []) map.set(c.status, [])
    for (const t of sprintTasks) {
      if (!map.has(t.status)) map.set(t.status, [])
      map.get(t.status)!.push(t)
    }
    for (const list of map.values()) list.sort((a, b) => a.boardRank - b.boardRank)
    return map
  }, [sprintTasks, columns])

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const destStatus = destination.droppableId
    const destList = (byStatus.get(destStatus) ?? []).filter((t) => t.id !== draggableId)
    const above = destList[destination.index - 1]?.boardRank
    const below = destList[destination.index]?.boardRank
    const newRank =
      above != null && below != null ? (above + below) / 2
      : above != null ? above + 1
      : below != null ? below - 1
      : 0

    move.mutate({ taskId: draggableId, body: { status: destStatus, boardRank: newRank } })
  }

  if (isLoading || !columns) {
    return (
      <div className="flex gap-4 overflow-x-auto p-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 w-80 shrink-0 rounded-xl" />
        ))}
      </div>
    )
  }

  // No active sprint → nothing to show on the board (start one from the Backlog).
  if (!activeSprint) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Layers className="h-7 w-7" />
        </span>
        <div>
          <p className="text-sm font-semibold">No active sprint</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The board shows the active sprint. Open the <span className="font-semibold">Backlog</span> tab to start one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Active-sprint banner */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">{activeSprint.name}</span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
        {activeSprint.startDate && activeSprint.endDate && (
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(activeSprint.startDate), "MMM d")} – {format(new Date(activeSprint.endDate), "MMM d")}
          </span>
        )}
        {activeSprint.goal && <span className="hidden text-[11px] italic text-muted-foreground sm:inline">· {activeSprint.goal}</span>}
        <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          {sprintTasks.length} {sprintTasks.length === 1 ? "story" : "stories"}
        </span>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto p-1">
        {columns.map((col: BoardColumn) => {
          const list = byStatus.get(col.status) ?? []
          const overLimit = col.wipLimit != null && list.length > col.wipLimit
          return (
            <div key={col.id} className="flex max-h-full w-80 shrink-0 flex-col rounded-xl bg-muted/40">
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[col.status]?.dot ?? "bg-slate-400"}`} />
                  <span className="text-sm font-semibold">{col.name}</span>
                  <span
                    className={`rounded-full px-1.5 text-[11px] font-bold ${
                      overLimit ? "bg-red-100 text-red-700" : "bg-background text-muted-foreground"
                    }`}
                  >
                    {list.length}
                    {col.wipLimit != null ? `/${col.wipLimit}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <PermissionGate permission="canCreateStories">
                    <button
                      onClick={() => openCreateTask(col.status, activeSprint?.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      title="Add task"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="canEditBoard">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (confirm(`Delete column "${col.name}"? Tasks in it are not deleted.`))
                              removeColumn.mutate(col.id)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </PermissionGate>
                </div>
              </div>

              {/* Droppable list */}
              <Droppable droppableId={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-2 overflow-y-auto px-2 pb-2 transition-colors ${
                      snapshot.isDraggingOver ? "rounded-lg bg-primary/5 ring-2 ring-dashed ring-primary/40" : ""
                    }`}
                  >
                    {list.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(dp, ds) => (
                          // dragHandleProps types `role: string`, incompatible with React's
                          // `role?: AriaRole` literal union — cast to satisfy the checker.
                          <div ref={dp.innerRef} {...dp.draggableProps} {...(dp.dragHandleProps as any)}>
                            <TaskCard task={task} dragging={ds.isDragging} onClick={() => openTask(task.id)} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {list.length === 0 && !snapshot.isDraggingOver && (
                      <PermissionGate permission="canCreateStories">
                        <button
                          onClick={() => openCreateTask(col.status, activeSprint?.id)}
                          className="w-full rounded-lg border border-dashed border-border py-6 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                        >
                          + Add a task
                        </button>
                      </PermissionGate>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}

        <PermissionGate permission="canEditBoard">
          <CreateColumnButton projectId={projectId} />
        </PermissionGate>
        </div>
      </DragDropContext>
    </div>
  )
}
