"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { Story, Sprint, StoryCardView, BOARD_COLUMNS, points, ConfirmModal } from "./shared"
import { type BoardConfig } from "./board-config"
import QuickCreateCard from "./quick-create-card"
import BulkActionBar from "./bulk-action-bar"
import { ChevronRight, Target, AlertTriangle } from "lucide-react"

interface SprintKanbanProps {
  stories: Story[]
  sprints: Sprint[]
  onPatch: (s: Story, body: Record<string, unknown>) => void
  onOpen: (s: Story) => void
  config: BoardConfig
  projectId: string
}

export default function SprintKanban({ stories, sprints, onPatch, onOpen, config, projectId }: SprintKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const defaultSprint = useMemo(
    () => sprints.find((s) => s.status === "Active")?.id || sprints[0]?.id || "",
    [sprints]
  )
  const [sprintId, setSprintId] = useState(defaultSprint)
  useEffect(() => { if (!sprintId && defaultSprint) setSprintId(defaultSprint) }, [defaultSprint, sprintId])

  const sprint = sprints.find((s) => s.id === sprintId) || null
  const sprintStories = stories.filter((s) => s.sprintId === sprintId && s.status !== "Deprecated")

  const activeStory = stories.find((s) => s.id === activeId) || null

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? String(e.over.id) : null
    const story = stories.find((s) => s.id === e.active.id)
    if (!overId || !story) return
    const col = BOARD_COLUMNS.find((c) => c.id === overId)
    if (!col) return
    if (col.statuses.includes(story.status)) return
    onPatch(story, { status: col.setStatus })
  }

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)
  }

  const bulkMove = (status: string) => {
    selectedIds.forEach((id) => {
      const story = stories.find((s) => s.id === id)
      if (story) onPatch(story, { status })
    })
    setSelectedIds(new Set())
    setBulkMode(false)
  }

  const bulkDelete = () => {
    selectedIds.forEach((id) => {
      const story = stories.find((s) => s.id === id)
      if (story) {
        fetch(`/api/requirements/${story.id}`, { method: "DELETE" }).catch(() => {})
      }
    })
    setSelectedIds(new Set())
    setBulkMode(false)
    setTimeout(() => window.location.reload(), 500)
  }

  if (sprints.length === 0) {
    return <Empty text="No active sprints found. Create a sprint in the Backlog view to begin planning." />
  }
  if (!sprint) {
    return <Empty text="Select a sprint from the dropdown menu to load its Kanban board." />
  }

  const doneCount = sprintStories.filter((s) => s.status === "Covered").length
  const progressPct = sprintStories.length > 0 ? (doneCount / sprintStories.length) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Sprint Info Ribbon */}
      <div className="flex items-center gap-4 p-4 bg-background border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm flex-wrap">
        <div className="flex items-center gap-2.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Active Sprint</label>
          <select
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
            className="h-8.5 text-xs font-extrabold rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 outline-none cursor-pointer focus:ring-1 focus:ring-indigo-500 shadow-sm"
          >
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.status === "Active" ? " (Active)" : ""}</option>
            ))}
          </select>
        </div>

        {sprint.goal && (
          <span className="text-xs text-slate-700 dark:text-slate-350 font-bold bg-muted/40 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-850 flex items-center gap-1.5">
            🎯 {sprint.goal}
          </span>
        )}

        {/* Sprint progress meter */}
        <div className="flex-1 min-w-[200px] max-w-sm flex items-center gap-3.5 ml-auto">
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-850 rounded-full overflow-hidden border">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 whitespace-nowrap bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">{doneCount} / {sprintStories.length} Done</span>
        </div>

        <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-xl">{points(sprintStories)} Story Points</span>

        {/* Bulk mode select */}
        <button
          onClick={() => { setBulkMode((v) => !v); setSelectedIds(new Set()) }}
          className={`h-8.5 px-3.5 rounded-xl text-xs font-black transition-all ${bulkMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10 border-indigo-600" : "border text-muted-foreground hover:bg-muted"}`}
        >
          {bulkMode ? "Finish Actions" : "Select Cards"}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
        <div className="flex gap-6 overflow-x-auto pb-4 items-start select-none kanban-scroll min-h-[60vh] min-w-max">
          {BOARD_COLUMNS.map((col) => {
            const isCollapsed = config.collapsedColumns.includes(col.id)
            if (isCollapsed) {
              return (
                <button
                  key={col.id}
                  onClick={() => {
                    const next = config.collapsedColumns.filter((c) => c !== col.id)
                  }}
                  className={`border border-t-2 ${col.accent} rounded-2xl bg-card/65 p-4 flex flex-col items-center justify-center gap-3 min-h-[140px] hover:bg-muted/40 transition-all duration-300 shadow-sm`}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 [writing-mode:vertical-lr]">{col.label}</span>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {sprintStories.filter((s) => col.statuses.includes(s.status)).length}
                  </span>
                </button>
              )
            }

            const list = sprintStories.filter((s) => col.statuses.includes(s.status))
            const wipLimit = config.wipLimits[col.id]
            const overLimit = wipLimit > 0 && list.length > wipLimit

            return (
              <KanbanColumn
                key={col.id}
                col={col}
                list={list}
                onOpen={onOpen}
                config={config}
                overLimit={overLimit}
                count={list.length}
                wipLimit={wipLimit}
                projectId={projectId}
                sprintId={sprintId}
                stories={stories}
                bulkMode={bulkMode}
                selectedIds={selectedIds}
                onSelect={toggleSelect}
              />
            )
          })}
        </div>
        <DragOverlay>{activeStory ? <StoryCardView story={activeStory} dragging colorMode={config.cardColorMode} size={config.cardSize} /> : null}</DragOverlay>
      </DndContext>

      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onMoveToColumn={bulkMove}
        onDelete={() => setShowBulkDeleteConfirm(true)}
      />

      {showBulkDeleteConfirm && (
        <ConfirmModal
          title="Delete Multiple Issues"
          message={`Are you sure you want to permanently delete the ${selectedIds.size} selected user stories? This action cannot be undone.`}
          onConfirm={() => {
            bulkDelete()
            setShowBulkDeleteConfirm(false)
          }}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

function KanbanColumn({
  col, list, onOpen, config, overLimit, count, wipLimit, projectId, sprintId, stories, bulkMode, selectedIds, onSelect,
}: {
  col: typeof BOARD_COLUMNS[0]
  list: Story[]
  onOpen: (s: Story) => void
  config: BoardConfig
  overLimit: boolean
  count: number
  wipLimit: number
  projectId: string
  sprintId: string
  stories: Story[]
  bulkMode: boolean
  selectedIds: Set<string>
  onSelect: (id: string, checked: boolean) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  const swimlaneKey = (s: Story): string => {
    switch (config.swimlaneMode) {
      case "assignee": return s.assignee || "Unassigned"
      case "epic": return s.epic ? `${s.epic.epicKey} · ${s.epic.title}` : "No Epic"
      case "parent": return s.parent ? s.parent.requirementKey : "Independent"
      default: return ""
    }
  }

  const groups = useMemo(() => {
    if (config.swimlaneMode === "none") return { "": list }
    const map = new Map<string, Story[]>()
    for (const s of list) {
      const key = swimlaneKey(s)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    const entries = Array.from(map.entries())
    entries.sort((a, b) => a[0].localeCompare(b[0]))
    return Object.fromEntries(entries)
  }, [list, config.swimlaneMode])

  // Custom visual background shades based on columns
  const colBgMap: Record<string, string> = {
    todo: "bg-slate-50/50 dark:bg-slate-900/10",
    inprogress: "bg-indigo-50/15 dark:bg-indigo-950/5",
    blocked: "bg-red-50/10 dark:bg-red-950/5",
    done: "bg-emerald-50/15 dark:bg-emerald-950/5",
  }

  const isInProgress = col.id === "inprogress"
  const dotColorClass = col.id === "todo" ? "bg-slate-400" : isInProgress ? "bg-primary animate-pulse" : col.id === "blocked" ? "bg-error" : "bg-emerald-500"
  
  return (
    <div
      ref={setNodeRef}
      className={`w-[320px] flex flex-col max-h-full bg-[#f8f9ff]/50 rounded-xl border border-outline-variant/60 shadow-sm flex-shrink-0 transition-all duration-300 ${isOver ? "border-2 border-dashed border-primary bg-indigo-50/20" : ""} ${overLimit ? "bg-red-50/40 border-red-300" : ""}`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b rounded-t-xl ${isInProgress ? "border-primary/20 bg-indigo-50/40" : "border-outline-variant/50 bg-white"} ${overLimit ? "bg-red-50/70" : ""}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColorClass}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">{col.label}</span>
          <span className={`text-[10px] font-black rounded-full px-2 py-0.5 ${isInProgress ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"}`}>
            {count}{wipLimit > 0 ? ` / Limit ${wipLimit}` : ""}
          </span>
        </div>
      </div>
      <div className="p-2.5 space-y-2 flex-1 min-h-[140px]">
        {Object.entries(groups).map(([groupName, groupStories]) => (
          <div key={groupName} className="space-y-1.5">
            {config.swimlaneMode !== "none" && groupName && (
              <div className="flex items-center gap-2 px-2 py-1 bg-indigo-50/50 dark:bg-slate-800/40 rounded-xl border border-slate-100/50 dark:border-slate-850">
                <span className="text-[9px] font-black text-slate-700 dark:text-slate-350 truncate uppercase tracking-wider">{groupName}</span>
                <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 ml-auto">{points(groupStories)} pts</span>
              </div>
            )}
            {groupStories.map((s) => (
              <DraggableCard
                key={s.id}
                story={s}
                onOpen={onOpen}
                colorMode={config.cardColorMode}
                size={config.cardSize}
                showCheckbox={bulkMode}
                selected={selectedIds.has(s.id)}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-[10px] text-muted-foreground/60 text-center py-8 font-medium border-2 border-dashed border-slate-100 dark:border-slate-850 rounded-xl">
            Drop cards here
          </div>
        )}
        <div className="pt-1.5">
          <QuickCreateCard
            projectId={projectId}
            sprintId={sprintId}
            defaultStatus={col.setStatus}
            stories={stories}
            onCreated={() => window.location.reload()}
          />
        </div>
      </div>
    </div>
  )
}

function DraggableCard({ story, onOpen, colorMode, size, showCheckbox, selected, onSelect }: {
  story: Story
  onOpen: (s: Story) => void
  colorMode: string
  size: string
  showCheckbox?: boolean
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: story.id })
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-35 scale-95 transition-all" : "transition-all"}>
      <StoryCardView
        story={story}
        onOpen={onOpen}
        handleProps={{ ...attributes, ...listeners }}
        colorMode={colorMode as any}
        size={size as any}
        showCheckbox={showCheckbox}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl bg-card py-16 text-center text-xs text-muted-foreground font-medium max-w-lg mx-auto shadow-sm">
      <Target className="h-8 w-8 text-indigo-500 mx-auto mb-2 opacity-60" />
      {text}
    </div>
  )
}
