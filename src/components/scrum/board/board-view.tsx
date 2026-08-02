"use client"

import { useMemo, useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import type { ScrumTask, BoardColumn, TaskFilters } from "@/types/scrum"
import {
  useScrumTasks,
  useBoardColumns,
  useMoveTask,
  useColumnMutations,
  useScrumSprints,
  useScrumEpics,
  useCurrentUser,
} from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { STATUS_META, overdueDays } from "@/components/scrum/shared"
import { TaskCard } from "./task-card"
import { CardLayoutToggle, type CardLayout } from "./card-layout-toggle"
import { CreateColumnButton } from "./create-column-button"
import { QuickFilters, type QuickFilter } from "./quick-filters"
import { SwimlaneToggle, type SwimlaneMode } from "./swimlane-toggle"
import { PermissionGate } from "@/components/permissions/PermissionGate"
import { CompleteSprintModal } from "@/components/scrum/modals/complete-sprint-modal"
import {
  Plus, MoreHorizontal, Trash2, Zap, Layers, User, FolderKanban, CheckCircle2,
  Settings, Pencil, Hash, AlertTriangle, X
} from "lucide-react"
import { format } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function BoardView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const { data: tasks, isLoading } = useScrumTasks(projectId, filters)
  const { data: columns } = useBoardColumns(projectId)
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)
  const { data: currentUser } = useCurrentUser()
  const move = useMoveTask(projectId)
  const { openTask, openCreateTask } = useScrumUI()
  const { remove: removeColumn, update: updateColumn } = useColumnMutations(projectId)

  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([])
  const [epicFilter, setEpicFilter] = useState<string | null>(null)
  const [swimlane, setSwimlane] = useState<SwimlaneMode>("none")
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [cardLayout, setCardLayout] = useState<CardLayout>("detailed")

  // Column inline-edit state
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editWip, setEditWip] = useState<string>("")
  const [editError, setEditError] = useState<string | null>(null)
  const [columnPendingDelete, setColumnPendingDelete] = useState<BoardColumn | null>(null)

  // Board settings
  const [showSettings, setShowSettings] = useState(false)
  const [showEstimations, setShowEstimations] = useState(true)
  const [showSubtasks, setShowSubtasks] = useState(true)

  // The board shows only the ACTIVE sprint's stories (Jira-style sprint board).
  const activeSprint = useMemo(() => (sprints ?? []).find((s) => s.status === "ACTIVE") ?? null, [sprints])

  // Apply quick filters client-side on top of server filters
  const sprintTasks = useMemo(() => {
    let list = activeSprint ? (tasks ?? []).filter((t) => t.sprintId === activeSprint.id) : []

    if (quickFilters.includes("my-issues") && currentUser) {
      list = list.filter((t) => t.assignees.some((a) => a.id === currentUser.id))
    }
    if (quickFilters.includes("recently-updated")) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      list = list.filter((t) => new Date(t.updatedAt).getTime() > cutoff)
    }
    if (quickFilters.includes("only-stories")) {
      list = list.filter((t) => t.type === "STORY")
    }
    if (quickFilters.includes("high-priority")) {
      list = list.filter((t) => t.priority === "HIGH" || t.priority === "HIGHEST")
    }
    if (quickFilters.includes("overdue")) {
      list = list.filter((t) => overdueDays(t.dueDate, t.status) !== null)
    }
    if (epicFilter) {
      list = list.filter((t) => t.epic?.id === epicFilter)
    }

    return list
  }, [tasks, activeSprint, quickFilters, epicFilter, currentUser])

  // Sprint story-point stats
  const sprintStats = useMemo(() => {
    const total = sprintTasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0)
    const completed = sprintTasks
      .filter((t) => t.status === "DONE" || t.status === "DEPLOYED")
      .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0)
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, pct }
  }, [sprintTasks])

  const sprintSummaryData = useMemo(() => {
    if (!activeSprint) return null
    return {
      id: activeSprint.id,
      name: activeSprint.name,
      goal: activeSprint.goal,
      startDate: activeSprint.startDate,
      endDate: activeSprint.endDate,
      tasks: sprintTasks.map((t) => ({
        id: t.id,
        key: t.key,
        title: t.title,
        status: t.status,
        storyPoints: t.storyPoints,
        type: t.type,
        assignees: t.assignees.map((a) => ({ name: a.name, email: a.email })),
      })),
    }
  }, [activeSprint, sprintTasks])

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

  // Group tasks within a column by swimlane key
  function groupBySwimlane(tasks: ScrumTask[]): { key: string; label: string; tasks: ScrumTask[] }[] {
    if (swimlane === "none") return [{ key: "all", label: "", tasks }]

    const groups = new Map<string, { key: string; label: string; tasks: ScrumTask[] }>()

    if (swimlane === "assignee") {
      // A task must appear EXACTLY ONCE across all lanes. Previously a task
      // with N assignees was pushed into N lanes, which produced duplicate
      // `draggableId`s inside a single Droppable — react-beautiful-dnd throws
      // on that, and React logged duplicate-key warnings. Multi-assignee tasks
      // are filed under their first assignee.
      for (const t of tasks) {
        const primary = t.assignees[0]
        const k = primary?.id ?? "unassigned"
        const label = primary ? primary.name || primary.email : "Unassigned"
        if (!groups.has(k)) groups.set(k, { key: k, label, tasks: [] })
        groups.get(k)!.tasks.push(t)
      }
    } else if (swimlane === "epic") {
      for (const t of tasks) {
        const k = t.epic?.id ?? "no-epic"
        const label = t.epic?.title ?? "No Epic"
        if (!groups.has(k)) groups.set(k, { key: k, label, tasks: [] })
        groups.get(k)!.tasks.push(t)
      }
    }

    return Array.from(groups.values())
  }

  function getDisplayList(tasks: ScrumTask[]): ScrumTask[] {
    if (swimlane === "none") return tasks
    return groupBySwimlane(tasks).flatMap((g) => g.tasks)
  }

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const destStatus = destination.droppableId
    const destRawList = byStatus.get(destStatus) ?? []
    const destDisplayList = getDisplayList(destRawList)
    const destList = destDisplayList.filter((t) => t.id !== draggableId)
    const above = destList[destination.index - 1]?.boardRank
    const below = destList[destination.index]?.boardRank
    const newRank =
      above != null && below != null ? (above + below) / 2
      : above != null ? above + 1
      : below != null ? below - 1
      : 0

    move.mutate({ taskId: draggableId, body: { status: destStatus, boardRank: newRank } })
  }

  function startEditColumn(col: BoardColumn) {
    setEditingColumn(col.id)
    setEditName(col.name)
    setEditWip(col.wipLimit?.toString() ?? "")
  }

  function saveColumnEdit(colId: string) {
    const body: Record<string, unknown> = {}
    const name = editName.trim()
    if (!name) {
      setEditError("Column name can't be empty")
      return
    }
    body.name = name

    const raw = editWip.trim()
    if (raw === "") {
      body.wipLimit = null
    } else {
      const wip = Number(raw)
      // Previously an unparseable value was silently dropped with no feedback.
      if (!Number.isInteger(wip) || wip < 1) {
        setEditError("WIP limit must be a whole number of 1 or more")
        return
      }
      body.wipLimit = wip
    }

    updateColumn.mutate({ columnId: colId, body })
    setEditingColumn(null)
    setEditError(null)
  }

  function startEditing(col: BoardColumn) {
    startEditColumn(col)
    setEditError(null)
  }

  function cancelEditing() {
    setEditingColumn(null)
    setEditError(null)
  }

  if (isLoading || !columns) {
    return (
      <div className="flex gap-4 overflow-x-auto p-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 w-80 shrink-0 rounded-lg" />
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
          <p className="text-sm font-semibold text-foreground">No active sprint</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The board shows the active sprint. Open the <span className="font-semibold text-foreground">Backlog</span> tab to start one.
          </p>
        </div>
      </div>
    )
  }

  const activeEpic = epics?.find((e) => e.id === epicFilter)

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Active-sprint banner */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{activeSprint.name}</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Active</span>
        {activeSprint.startDate && activeSprint.endDate && (
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(activeSprint.startDate), "MMM d")} – {format(new Date(activeSprint.endDate), "MMM d")}
          </span>
        )}
        {activeSprint.goal && <span className="hidden text-[11px] italic text-muted-foreground sm:inline">· {activeSprint.goal}</span>}

        {/* Story point progress */}
        {sprintStats.total > 0 && (
          <div className="ml-2 hidden items-center gap-2 md:flex">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${sprintStats.pct}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {sprintStats.completed}/{sprintStats.total} pts
            </span>
          </div>
        )}

        <PermissionGate permission="canCreateSprints">
          <button
            onClick={() => setCompleteModalOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            title="Complete this sprint"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Complete Sprint
          </button>
        </PermissionGate>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {sprintTasks.length} {sprintTasks.length === 1 ? "story" : "stories"}
        </span>
      </div>

      {/* Toolbar: Quick Filters + Epic Filter + Card Layout + Swimlane Toggle + Board Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilters activeFilters={quickFilters} onChange={setQuickFilters} />
          {/* Epic quick filter */}
          {epics && epics.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground">
                <FolderKanban className="h-3 w-3" />
                {activeEpic ? activeEpic.title : "Epic"}
                {activeEpic && <X className="h-3 w-3" onClick={(e) => { e.stopPropagation(); setEpicFilter(null) }} />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filter by Epic</p>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEpicFilter(null)} className="text-xs">
                  <span className={epicFilter === null ? "font-semibold text-primary" : ""}>All epics</span>
                </DropdownMenuItem>
                {epics.map((epic) => (
                  <DropdownMenuItem key={epic.id} onClick={() => setEpicFilter(epic.id)} className="gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: epic.color }} />
                    <span className={epicFilter === epic.id ? "font-semibold text-primary" : ""}>{epic.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardLayoutToggle value={cardLayout} onChange={setCardLayout} />
          <SwimlaneToggle value={swimlane} onChange={setSwimlane} />
          {/* Board Settings */}
          <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
            <DropdownMenuTrigger className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Settings className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Board Settings</p>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowEstimations((v) => !v)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> Show estimations
                </span>
                {showEstimations && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowSubtasks((v) => !v)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Show subtasks
                </span>
                {showSubtasks && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto p-1">
        {columns.map((col: BoardColumn) => {
          const rawList = byStatus.get(col.status) ?? []
          const overLimit = col.wipLimit != null && rawList.length > col.wipLimit
          const swimlaneGroups = groupBySwimlane(rawList)
          const displayList = swimlaneGroups.flatMap((g) => g.tasks)
          const indexMap = new Map(displayList.map((t, i) => [t.id, i]))

          return (
            <div key={col.id} className="flex max-h-full w-80 shrink-0 flex-col rounded-lg border bg-muted/60">
              {/* Column header */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_META[col.status]?.dot ?? "bg-muted-foreground"}`} />
                  {editingColumn === col.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 w-24 px-1.5 py-0 text-xs"
                        aria-label="Column name"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveColumnEdit(col.id)
                          if (e.key === "Escape") cancelEditing()
                        }}
                      />
                      <Input
                        value={editWip}
                        onChange={(e) => setEditWip(e.target.value)}
                        className="h-6 w-14 px-1.5 py-0 text-xs"
                        placeholder="WIP"
                        aria-label="WIP limit (blank for none)"
                        inputMode="numeric"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveColumnEdit(col.id)
                          if (e.key === "Escape") cancelEditing()
                        }}
                      />
                      <button
                        onClick={() => saveColumnEdit(col.id)}
                        className="rounded p-0.5 text-primary transition-colors hover:bg-accent"
                        aria-label="Save column"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="truncate text-sm font-medium text-foreground">{col.name}</span>
                  )}
                  <span
                    className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold ${
                      overLimit ? "bg-destructive/10 text-destructive" : "bg-background text-muted-foreground"
                    }`}
                  >
                    {rawList.length}
                    {col.wipLimit != null ? `/${col.wipLimit}` : ""}
                  </span>
                  {overLimit && (
                    <span title={`WIP limit exceeded (${rawList.length}/${col.wipLimit})`}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <PermissionGate permission="canCreateStories">
                    <button
                      onClick={() => openCreateTask(col.status, activeSprint?.id)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      title={`Add task to ${col.name}`}
                      aria-label={`Add task to ${col.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="canEditBoard">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        aria-label={`${col.name} column options`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => startEditing(col)} className="gap-2 text-xs">
                          <Pencil className="h-3.5 w-3.5" /> Rename &amp; set WIP limit
                        </DropdownMenuItem>
                        {col.wipLimit != null && (
                          <DropdownMenuItem
                            onClick={() => updateColumn.mutate({ columnId: col.id, body: { wipLimit: null } })}
                            className="gap-2 text-xs"
                          >
                            <Hash className="h-3.5 w-3.5" /> Clear WIP limit ({col.wipLimit})
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-xs text-destructive focus:text-destructive"
                          onClick={() => setColumnPendingDelete(col)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </PermissionGate>
                </div>
              </div>

              {editingColumn === col.id && editError && (
                <p role="alert" className="px-3 pb-1.5 text-[11px] font-medium text-destructive">
                  {editError}
                </p>
              )}

              {/* Droppable list */}
              <Droppable droppableId={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-2 overflow-y-auto px-2 pb-2 transition-colors ${
                      snapshot.isDraggingOver ? "rounded-lg bg-primary/10 ring-2 ring-dashed ring-primary/40" : ""
                    }`}
                  >
                    {swimlane === "none" ? (
                      // Original flat list
                      <>
                        {rawList.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(dp, ds) => (
                              <div ref={dp.innerRef} {...dp.draggableProps} {...(dp.dragHandleProps as any)}>
                                <TaskCard
                                  task={task}
                                  projectId={projectId}
                                  layout={cardLayout}
                                  dragging={ds.isDragging}
                                  onClick={() => openTask(task.id)}
                                  hideEstimations={!showEstimations}
                                  hideSubtasks={!showSubtasks}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                      </>
                    ) : (
                      // Swimlane grouped list
                      <>
                        {swimlaneGroups.map((group) => (
                          <div key={group.key} className="space-y-1.5">
                            {/* Swimlane header */}
                            <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                              {swimlane === "assignee" && (
                                <User className="h-3 w-3 text-muted-foreground" />
                              )}
                              {swimlane === "epic" && (
                                <>
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                      backgroundColor:
                                        group.key !== "no-epic"
                                          ? (epics?.find((e) => e.id === group.key)?.color ?? "hsl(var(--muted-foreground))")
                                          : "hsl(var(--muted-foreground))",
                                    }}
                                  />
                                  <FolderKanban className="h-3 w-3 text-muted-foreground" />
                                </>
                              )}
                              <span className="text-[10px] font-semibold text-muted-foreground truncate">{group.label}</span>
                              <span className="ml-auto text-[10px] font-semibold text-muted-foreground">{group.tasks.length}</span>
                            </div>
                            {group.tasks.map((task) => (
                              <Draggable key={task.id} draggableId={task.id} index={indexMap.get(task.id)!}>
                                {(dp, ds) => (
                                  <div ref={dp.innerRef} {...dp.draggableProps} {...(dp.dragHandleProps as any)}>
                                    <TaskCard
                                      task={task}
                                      projectId={projectId}
                                      layout={cardLayout}
                                      dragging={ds.isDragging}
                                      onClick={() => openTask(task.id)}
                                      hideEstimations={!showEstimations}
                                      hideSubtasks={!showSubtasks}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                    {provided.placeholder}
                    {rawList.length === 0 && !snapshot.isDraggingOver && (
                      <PermissionGate permission="canCreateStories">
                        <button
                          onClick={() => openCreateTask(col.status, activeSprint?.id)}
                          className="w-full rounded-lg border border-dashed border-border py-6 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          <Plus className="mx-auto mb-1 h-4 w-4" />
                          Add a task
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

      {/* Complete Sprint Modal */}
      <CompleteSprintModal
        projectId={projectId}
        sprint={sprintSummaryData}
        open={completeModalOpen}
        onOpenChange={setCompleteModalOpen}
        onCompleted={() => {
          // Router refresh handled inside modal; queries invalidated there too
        }}
        sprints={(sprints ?? []).map((s) => ({ id: s.id, name: s.name, status: s.status }))}
      />

      {/* Delete-column confirmation (replaces the native window.confirm) */}
      <ConfirmDialog
        open={columnPendingDelete !== null}
        variant="danger"
        title={`Delete "${columnPendingDelete?.name}"?`}
        description={
          (byStatus.get(columnPendingDelete?.status ?? "")?.length ?? 0) > 0
            ? `This column still holds ${byStatus.get(columnPendingDelete!.status)!.length} issue(s). The issues are not deleted — they keep their "${columnPendingDelete?.status}" status and will reappear if you recreate the column.`
            : "The column will be removed from this board. Issues are never deleted by this action."
        }
        confirmLabel="Delete column"
        isLoading={removeColumn.isPending}
        onConfirm={async () => {
          if (!columnPendingDelete) return
          await removeColumn.mutateAsync(columnPendingDelete.id)
          setColumnPendingDelete(null)
        }}
        onCancel={() => setColumnPendingDelete(null)}
      />
    </div>
  )
}
