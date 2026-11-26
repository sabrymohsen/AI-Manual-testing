"use client"

import { useMemo, useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import type { ScrumTask, BoardColumn, TaskFilters, TaskStatus } from "@/types/scrum"
import {
  useScrumTasks,
  useBoardColumns,
  useMoveTask,
  useColumnMutations,
  useScrumSprints,
  useScrumEpics,
  useCurrentUser,
  setBoardDragging,
} from "@/hooks/scrum/use-scrum"
import { useScrumUI, boardDisplayFor, type BoardDisplay } from "@/stores/scrum-ui"
import { STATUS_META, STATUS_ORDER, overdueDays, StatusIcon } from "@/components/scrum/shared"
import { TaskCard } from "./task-card"
import { CreateColumnButton } from "./create-column-button"
import { QuickFilters, type QuickFilter } from "./quick-filters"
import { PermissionGate } from "@/components/permissions/PermissionGate"
import { CompleteSprintModal } from "@/components/scrum/modals/complete-sprint-modal"
import { SprintReportDialog } from "./sprint-report"
import {
  Plus, MoreHorizontal, Trash2, Layers, User, FolderKanban, CheckCircle2,
  Pencil, Hash, AlertTriangle, X, Check,
  BarChart3,
} from "@/components/ui/icons"
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
  const { remove: removeColumn, update: updateColumn, create: createColumn } = useColumnMutations(projectId)

  const display = useScrumUI((st) => boardDisplayFor(st, projectId))
  const setDisplayFor = useScrumUI((st) => st.setBoardDisplay)
  const setDisplay = (patch: Partial<BoardDisplay>) => setDisplayFor(projectId, patch)
  const { quickFilters, swimlane, cardLayout, showEstimations, showSubtasks } = display
  // An epic that no longer exists (deleted, or stale) must not silently empty the board.
  const epicFilter = display.epicFilter && epics?.some((e) => e.id === display.epicFilter) ? display.epicFilter : null
  const setQuickFilters = (q: QuickFilter[]) => setDisplay({ quickFilters: q })
  const setEpicFilter = (id: string | null) => setDisplay({ epicFilter: id })
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  // Column inline-edit state
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editWip, setEditWip] = useState<string>("")
  const [editError, setEditError] = useState<string | null>(null)
  const [columnPendingDelete, setColumnPendingDelete] = useState<BoardColumn | null>(null)

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

  const blockedCount = useMemo(() => sprintTasks.filter((t) => t.signals?.blocked).length, [sprintTasks])

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

  // Every status that holds tasks gets a column, even without a saved one.
  // Tasks moved to Testing or Deployed on a board that only had To Do / In
  // Progress / In Review / Done used to vanish from the board while the sprint
  // header still counted them. A missing status is shown as a temporary
  // column (in workflow order) that can be saved with one click.
  const displayColumns = useMemo(() => {
    const saved = (columns ?? []) as (BoardColumn & { virtual?: boolean })[]
    const covered = new Set(saved.map((c) => c.status))
    const missing = STATUS_ORDER.filter((st) => !covered.has(st) && (byStatus.get(st)?.length ?? 0) > 0)
    if (!missing.length) return saved
    const out = [...saved]
    for (const st of missing) {
      const virtualCol = { id: `virtual-${st}`, name: STATUS_META[st].label, status: st, order: -1, wipLimit: null, projectId, createdAt: "", virtual: true } as unknown as BoardColumn & { virtual?: boolean }
      // Insert before the first saved column that comes later in the workflow.
      const at = out.findIndex((c) => STATUS_ORDER.indexOf(c.status as TaskStatus) > STATUS_ORDER.indexOf(st))
      out.splice(at === -1 ? out.length : at, 0, virtualCol)
    }
    return out
  }, [columns, byStatus, projectId])

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
      <div className="flex gap-3 overflow-x-auto px-3 py-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 w-[272px] shrink-0 rounded-lg" />
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
  const daysLeft = daysLeftLabel(activeSprint.endDate)

  return (
    <div className="flex h-full flex-col">
      {/* Row 2 — quick filters on the left, sprint health on the right. */}
      <div className="flex h-10 shrink-0 items-center gap-3 overflow-hidden border-b border-border bg-card px-4 text-xs">
        <div className="flex min-w-0 shrink items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          <QuickFilters activeFilters={quickFilters} onChange={setQuickFilters} />
          {epics && epics.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`inline-flex h-6 items-center gap-2 rounded-md border px-2 text-xs transition-colors ${
                  activeEpic
                    ? "border-border bg-background text-foreground"
                    : "border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {activeEpic ? (
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeEpic.color }} />
                ) : (
                  <FolderKanban className="h-3 w-3" />
                )}
                {activeEpic ? activeEpic.title : "Epic"}
                {activeEpic && (
                  <X
                    className="h-3 w-3 text-muted-foreground hover:text-foreground"
                    aria-label="Clear epic filter"
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setEpicFilter(null) }}
                  />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => setEpicFilter(null)} className="text-xs">
                  <span className={epicFilter === null ? "font-medium text-foreground" : "text-muted-foreground"}>All epics</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {epics.map((epic) => (
                  <DropdownMenuItem key={epic.id} onClick={() => setEpicFilter(epic.id)} className="gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: epic.color }} />
                    <span className={`truncate ${epicFilter === epic.id ? "font-medium text-foreground" : ""}`}>{epic.title}</span>
                    {epicFilter === epic.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {activeSprint.goal && (
          <span className="hidden min-w-0 flex-1 items-center gap-2 border-l border-border pl-3 xl:flex" title={activeSprint.goal}>
            <span className="text-muted-foreground">Goal</span>
            <span className="truncate text-foreground">{activeSprint.goal}</span>
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap text-muted-foreground">
          {sprintStats.total > 0 && (
            <span className="flex items-center gap-2" title={`${sprintStats.completed} of ${sprintStats.total} story points done`}>
              <ProgressRing pct={sprintStats.pct} />
              <span className="font-medium tabular-nums text-foreground">{sprintStats.pct}%</span>
              <span className="hidden tabular-nums sm:inline">· {sprintStats.completed} of {sprintStats.total} pts</span>
            </span>
          )}
          {daysLeft && <span className={daysLeft.late ? "text-red-600 dark:text-red-400" : ""}>{daysLeft.text}</span>}
          {blockedCount > 0 && (
            <span
              className="font-medium text-orange-600 dark:text-orange-400"
              title="Issues waiting on an unfinished 'is blocked by' issue"
            >
              {blockedCount} blocked
            </span>
          )}
          <span className="hidden tabular-nums 2xl:inline">{sprintTasks.length} {sprintTasks.length === 1 ? "issue" : "issues"}</span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <button
            onClick={() => setReportOpen(true)}
            className="inline-flex h-6 items-center gap-1 rounded-md px-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Burndown and velocity for this sprint"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Report
          </button>
          <PermissionGate permission="canCreateSprints">
            <button
              onClick={() => setCompleteModalOpen(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 font-medium text-foreground transition-colors hover:bg-muted"
              title="Complete this sprint"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Complete sprint
            </button>
          </PermissionGate>
        </div>
      </div>

      <DragDropContext onDragStart={() => setBoardDragging(true)} onDragEnd={(r) => { setBoardDragging(false); onDragEnd(r) }}>
        {/* Columns share the available width (flex-1) but never shrink below a
            readable 300px; past that the row overflows and scrolls sideways. */}
        <div className="board-scroll flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-3 py-3">
        {displayColumns.map((col: BoardColumn & { virtual?: boolean }) => {
          const rawList = byStatus.get(col.status) ?? []
          const overLimit = col.wipLimit != null && rawList.length > col.wipLimit
          const swimlaneGroups = groupBySwimlane(rawList)
          const displayList = swimlaneGroups.flatMap((g) => g.tasks)
          const indexMap = new Map(displayList.map((t, i) => [t.id, i]))

          return (
            <div
              key={col.id}
              className="flex max-h-full w-[272px] shrink-0 flex-col rounded-lg bg-muted/60"
            >
              {/* Column header */}
              <div className="group/col flex h-9 items-center justify-between gap-2 pl-3 pr-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusIcon status={col.status as TaskStatus} />
                  {editingColumn === col.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 w-24 px-2 py-0 text-xs"
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
                        className="h-6 w-14 px-2 py-0 text-xs"
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
                    <span className="truncate text-xs font-medium text-foreground">{col.name}</span>
                  )}
                  <span
                    className={`shrink-0 text-xs tabular-nums ${overLimit ? "font-medium text-destructive" : "text-muted-foreground"}`}
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
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition group-hover/col:opacity-100 focus-visible:opacity-100 hover:bg-card hover:text-foreground"
                      title={`Add task to ${col.name}`}
                      aria-label={`Add task to ${col.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </PermissionGate>
                  {col.virtual && (
                    <PermissionGate permission="canEditBoard">
                      <button
                        onClick={() => createColumn.mutate({ name: col.name, status: col.status })}
                        disabled={createColumn.isPending}
                        className="rounded px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-background"
                        title="These issues have a status with no column. Save it as a column on this board."
                      >
                        Add column
                      </button>
                    </PermissionGate>
                  )}
                  {!col.virtual && <PermissionGate permission="canEditBoard">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-card hover:text-foreground group-hover/col:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
                  </PermissionGate>}
                </div>
              </div>

              {editingColumn === col.id && editError && (
                <p role="alert" className="px-3 pb-2 text-xs font-medium text-destructive">
                  {editError}
                </p>
              )}

              {/* Droppable list */}
              <Droppable droppableId={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    // min-h-0 is required: a flex item defaults to
                    // min-height:auto, which refuses to shrink below its
                    // content, so overflow-y-auto would never actually scroll
                    // and the column would grow past max-h-full instead.
                    className={`min-h-[3rem] flex-1 space-y-2 overflow-y-auto rounded-md px-2 pb-2 transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""
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
                          <div key={group.key} className="space-y-2">
                            {/* Swimlane header */}
                            <div className="flex items-center gap-2 px-1 pb-0.5 pt-2">
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
                              <span className="truncate text-xs font-medium text-muted-foreground">{group.label}</span>
                              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{group.tasks.length}</span>
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
                    {!snapshot.isDraggingOver && (
                      <PermissionGate permission="canCreateStories">
                        <button
                          onClick={() => openCreateTask(col.status, activeSprint?.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add issue
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

      <SprintReportDialog projectId={projectId} sprintId={activeSprint.id} open={reportOpen} onOpenChange={setReportOpen} />

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
            ? `This column still holds ${byStatus.get(columnPendingDelete!.status)!.length} issue(s). The issues are not deleted — they keep their "${columnPendingDelete?.status}" status and stay on the board in a temporary column you can save again.`
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

/** Small donut showing sprint completion. */
function ProgressRing({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 6
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 -rotate-90" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
      <circle
        cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        className="text-primary"
        strokeDasharray={`${(Math.min(100, Math.max(0, pct)) / 100) * c} ${c}`}
      />
    </svg>
  )
}

/** "6 days left", "Ends today", or "3 days over" from a sprint end date. */
export function daysLeftLabel(endDate: string | null): { text: string; late: boolean } | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const today = new Date()
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000)
  if (days > 0) return { text: `${days} ${days === 1 ? "day" : "days"} left`, late: false }
  if (days === 0) return { text: "Ends today", late: false }
  return { text: `${-days} ${days === -1 ? "day" : "days"} over`, late: true }
}
