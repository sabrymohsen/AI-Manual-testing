"use client"

import { useState, type ComponentType } from "react"
import { Flag, GripVertical, Bug, FlaskConical, BookMarked, SquareCheckBig, Tag, ListChecks, Check, X, AlertTriangle } from "lucide-react"
import { epicColorClass, type CardColorMode, type CardSize } from "./board-config"

export interface Story {
  id: string
  projectId: string
  requirementKey: string
  title: string
  description?: string | null
  acceptanceCriteria?: string | null
  priority: "Low" | "Medium" | "High" | "Critical"
  status: string
  storyPoints: number | null
  assignee: string | null
  labels: string[]
  sprintId: string | null
  epic: { id: string; epicKey: string; title: string } | null
  computedCoverage?: string
  testCases?: StoryTestCaseLink[]
  bugReports?: StoryBugLink[]
  subtasks?: Subtask[]
  parent?: { id: string; requirementKey: string; title: string } | null
  children?: { id: string; requirementKey: string; title: string; status: string }[]
  updatedAt?: string
  dueDate?: string | null
  timeEstimate?: number | null
  timeSpent?: number | null
  boardRank?: number | null
}

export interface Subtask {
  id: string
  title: string
  done: boolean
  assignee: string | null
}

export interface StoryTestCaseLink {
  testCaseId: string
  testCase: { id: string; title: string; testCaseKey?: string | null; priority?: string; executionType?: string }
}

export interface StoryBugLink {
  bugReport: { id: string; bugKey: string; title: string; severity: string; status: string }
}

export interface EpicLite {
  id: string
  epicKey: string
  title: string
}

export interface IssueType {
  id: "Story" | "Task" | "Bug"
  label: string
  prefix: string
  icon: ComponentType<{ className?: string }>
  color: string
}

export const ISSUE_TYPES: IssueType[] = [
  { id: "Story", label: "Story", prefix: "STORY", icon: BookMarked, color: "text-emerald-600 dark:text-emerald-450" },
  { id: "Task", label: "Task", prefix: "TASK", icon: SquareCheckBig, color: "text-sky-600 dark:text-sky-450" },
  { id: "Bug", label: "Bug", prefix: "BUG", icon: Bug, color: "text-red-650 dark:text-red-450" },
]

export const issueTypeOf = (key: string): IssueType => {
  const p = key.split("-")[0]?.toUpperCase()
  return ISSUE_TYPES.find((t) => t.prefix === p) || ISSUE_TYPES[0]
}

export const nextIssueKey = (prefix: string, stories: Story[]): string => {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i")
  let max = 0
  for (const s of stories) {
    const m = s.requirementKey.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`
}

export const WORKFLOW_STATUSES: { id: string; label: string; color: string }[] = [
  { id: "Draft", label: "Draft", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350" },
  { id: "ReadyForTesting", label: "Ready for Testing", color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400" },
  { id: "InTesting", label: "In Testing", color: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" },
  { id: "PartiallyCovered", label: "Partially Covered", color: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" },
  { id: "Blocked", label: "Blocked", color: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
  { id: "Failed", label: "Failed", color: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-450" },
  { id: "Covered", label: "Done · Covered", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-450" },
  { id: "Deprecated", label: "Deprecated", color: "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" },
]

export interface Sprint {
  id: string
  name: string
  goal: string | null
  status: "Future" | "Active" | "Completed"
  startDate: string | null
  endDate: string | null
  orderIndex?: number
  completedAt?: string | null
}

export const PRIORITY_COLOR: Record<string, string> = {
  Critical: "text-red-600 dark:text-red-450",
  High: "text-orange-500 dark:text-orange-450",
  Medium: "text-amber-500 dark:text-amber-400",
  Low: "text-slate-400 dark:text-slate-500",
}

export const PRIORITY_RIBBONS: Record<string, string> = {
  Critical: "bg-red-550",
  High: "bg-orange-400",
  Medium: "bg-amber-450",
  Low: "bg-slate-300 dark:bg-slate-700",
}

export const POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21]

export const points = (list: Story[]) => list.reduce((n, s) => n + (s.storyPoints || 0), 0)

export interface BoardColumn {
  id: string
  label: string
  statuses: string[]
  setStatus: string
  accent: string
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: "todo", label: "To Do", statuses: ["Draft", "ReadyForTesting"], setStatus: "ReadyForTesting", accent: "border-t-slate-400/80" },
  { id: "inprogress", label: "In Progress", statuses: ["InTesting", "PartiallyCovered"], setStatus: "InTesting", accent: "border-t-indigo-500" },
  { id: "blocked", label: "Blocked", statuses: ["Blocked", "Failed"], setStatus: "Blocked", accent: "border-t-red-500" },
  { id: "done", label: "Done", statuses: ["Covered"], setStatus: "Covered", accent: "border-t-emerald-500" },
]

export const columnOf = (status: string) => BOARD_COLUMNS.find((c) => c.statuses.includes(status)) || null

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Future: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350",
    Active: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400",
    Completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-450",
  }
  return <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${map[status] || map.Future}`}>{status}</span>
}

export function StoryCardView({
  story,
  onPoints,
  onOpen,
  handleProps,
  dragging,
  colorMode = "priority",
  size = "normal",
  selected,
  onSelect,
  showCheckbox,
}: {
  story: Story
  onPoints?: (s: Story, p: number) => void
  onOpen?: (s: Story) => void
  handleProps?: any
  dragging?: boolean
  colorMode?: CardColorMode
  size?: CardSize
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
  showCheckbox?: boolean
}) {
  const [editPts, setEditPts] = useState(false)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const testCount = story.testCases?.length || 0
  const bugCount = story.bugReports?.length || 0
  const childCount = story.children?.length || 0
  const type = issueTypeOf(story.requirementKey)
  const labels = story.labels || []
  const subtasks = story.subtasks || []
  const subtaskDone = subtasks.filter((st) => st.done).length

  // Curated vertical color tags instead of plain border stroke
  const ribbonColor =
    colorMode === "priority"
      ? PRIORITY_RIBBONS[story.priority] || "bg-transparent"
      : colorMode === "epic" && story.epic
        ? epicColorClass(story.epic.id).replace("border-l-", "bg-")
        : "bg-transparent"

  const isCompact = size === "compact"

  return (
    <div
      className={`border border-slate-100 dark:border-slate-800/80 rounded-2xl bg-card flex items-stretch gap-0 overflow-hidden ${dragging ? "shadow-2xl rotate-1 scale-102 cursor-grabbing" : "shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 hover:border-indigo-200/80 dark:hover:border-indigo-800/50"} ${selected ? "ring-2 ring-indigo-500" : ""}`}
    >
      {/* 1. Left Color Ribbon */}
      <div className={`w-1.5 shrink-0 ${ribbonColor}`} />

      {/* 2. Main Content Container */}
      <div className={`flex-1 flex items-start gap-2.5 ${isCompact ? "p-2.5" : "p-3.5"}`}>
        {showCheckbox && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onSelect?.(story.id, e.target.checked)}
            className="mt-1.5 shrink-0 h-3.5 w-3.5 rounded border-slate-350 accent-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <button
          {...handleProps}
          className="mt-1 text-muted-foreground/30 hover:text-muted-foreground/70 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label="Drag handle"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onOpen ? () => onOpen(story) : undefined}
          disabled={!onOpen}
          className={`min-w-0 flex-1 text-left ${onOpen ? "cursor-pointer" : "cursor-default"}`}
        >
          {/* Metadata chips */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <type.icon className={`h-3.5 w-3.5 shrink-0 ${type.color}`} />
            <span className={`font-mono font-black text-indigo-650 dark:text-indigo-400 ${isCompact ? "text-[8.5px]" : "text-[9.5px]"}`}>
              {story.requirementKey}
            </span>
            {story.parent && (
              <span
                className={`font-black px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 truncate max-w-[100px] ${isCompact ? "text-[8px]" : "text-[8.5px]"}`}
                title={story.parent.title}
              >
                ↳ {story.parent.requirementKey}
              </span>
            )}
            {story.epic && (
              <span
                className={`font-black px-2 py-0.5 rounded-full truncate max-w-[100px] ${isCompact ? "text-[8px]" : "text-[8.5px]"} ${epicColorClass(story.epic.id).replace("border-l-", "bg-").replace("500", "50")} ${epicColorClass(story.epic.id).replace("border-l-", "text-").replace("500", "750")} dark:bg-opacity-10`}
              >
                {story.epic.epicKey}
              </span>
            )}
          </div>

          {/* Title */}
          <p className={`font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 hover:text-indigo-750 dark:hover:text-indigo-350 transition-colors ${isCompact ? "text-xs" : "text-[13.5px]"}`}>
            {story.title}
          </p>

          {/* Labels */}
          {!isCompact && labels.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {labels.slice(0, 2).map((l) => (
                <span key={l} className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-muted/40 text-muted-foreground flex items-center gap-0.5">
                  <Tag className="h-2 w-2 text-indigo-500" />
                  {l}
                </span>
              ))}
              {labels.length > 2 && <span className="text-[9px] font-black text-muted-foreground">+{labels.length - 2}</span>}
            </div>
          )}

          {/* Subtasks visual progress bar */}
          {subtasks.length > 0 && (
            <div className="w-full mt-2.5 space-y-1">
              <div className="flex items-center justify-between text-[8px] font-black uppercase text-muted-foreground/80">
                <span>Tasks progression</span>
                <span>{subtaskDone}/{subtasks.length} done</span>
              </div>
              <div className="w-full h-1 bg-slate-100 dark:bg-slate-850 rounded-full overflow-hidden border">
                <div
                  className="h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${(subtaskDone / subtasks.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer chips */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap border-t border-slate-50 dark:border-slate-850/40 pt-2">
            <Flag className={`h-3 w-3 ${PRIORITY_COLOR[story.priority] || "text-slate-400"}`} />
            <span className={`font-black uppercase tracking-wider text-muted-foreground/80 ${isCompact ? "text-[8px]" : "text-[9px]"}`}>
              {story.status}
            </span>
            {childCount > 0 && (
              <span className={`font-black text-sky-600 dark:text-sky-400 flex items-center gap-0.5 ${isCompact ? "text-[8px]" : "text-[9px]"}`} title="Sub-requirements">
                <ListChecks className="h-3 w-3" />
                {childCount}
              </span>
            )}
            {testCount > 0 && (
              <span className={`font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 ${isCompact ? "text-[8px]" : "text-[9px]"}`} title="Linked test cases">
                <FlaskConical className="h-3 w-3" />
                {testCount}
              </span>
            )}
            {bugCount > 0 && (
              <span className={`font-black text-red-600 dark:text-red-400 flex items-center gap-0.5 ${isCompact ? "text-[8px]" : "text-[9px]"}`} title="Reported bugs">
                <Bug className="h-3 w-3" />
                {bugCount}
              </span>
            )}
            {subtasks.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowSubtasks((v) => !v) }}
                className={`font-black flex items-center gap-0.5 ${isCompact ? "text-[8px]" : "text-[9px]"} ${subtaskDone === subtasks.length ? "text-emerald-600" : "text-amber-600"}`}
              >
                <Check className="h-3 w-3" /> Toggle Check list
              </button>
            )}
            {story.assignee && (
              <span
                className="ml-auto h-5.5 w-5.5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[9px] font-black flex items-center justify-center shrink-0 shadow-sm border border-background"
                title={story.assignee}
              >
                {story.assignee.trim().slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          {/* Subtasks dropdown list */}
          {showSubtasks && subtasks.length > 0 && (
            <div className="mt-2.5 space-y-1.5 border-t border-dashed border-slate-100 dark:border-slate-800 pt-2.5" onClick={(e) => e.stopPropagation()}>
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center gap-2 text-xs">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      await fetch(`/api/requirements/${story.id}/subtasks/${st.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ done: !st.done }),
                      })
                      window.location.reload()
                    }}
                    className={`h-4 w-4 rounded-md border flex items-center justify-center transition-all ${st.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-700 bg-background hover:border-slate-400"}`}
                  >
                    {st.done && <Check className="h-3 w-3" />}
                  </button>
                  <span className={`flex-1 truncate text-xs ${st.done ? "line-through text-muted-foreground/60" : "text-slate-750 dark:text-slate-205"}`}>
                    {st.title}
                  </span>
                  {st.assignee && (
                    <span className="text-[8px] font-black text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md uppercase">
                      {st.assignee.slice(0, 2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </button>

        {/* 3. Points bubble */}
        {onPoints ? (
          editPts ? (
            <select
              autoFocus
              value={story.storyPoints ?? 0}
              onChange={(e) => { onPoints(story, Number(e.target.value)); setEditPts(false) }}
              onBlur={() => setEditPts(false)}
              className="h-6.5 text-[10px] font-black rounded-lg border border-slate-200 dark:border-slate-800 bg-background shrink-0 outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <option value={0}>–</option>
              {POINT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setEditPts(true) }}
              className="h-6 min-w-6 px-1.5 rounded-full bg-slate-50 border border-slate-100 hover:bg-indigo-50 dark:bg-slate-850 dark:border-slate-800 dark:hover:bg-slate-800 text-[10px] font-black text-slate-700 dark:text-slate-350 shrink-0 shadow-sm transition-all"
              title="Story points"
            >
              {story.storyPoints ?? "–"}
            </button>
          )
        ) : (
          <span className="h-6 min-w-6 px-1.5 rounded-full bg-slate-50 border border-slate-100 dark:bg-slate-850 dark:border-slate-800 text-[10px] font-black flex items-center justify-center text-slate-700 dark:text-slate-350 shrink-0 shadow-sm">
            {story.storyPoints ?? "–"}
          </span>
        )}
      </div>
    </div>
  )
}

export function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "warning" | "info"
}) {
  const iconColor =
    variant === "danger"
      ? "text-red-500 bg-red-50 dark:bg-red-500/10"
      : variant === "warning"
        ? "text-amber-500 bg-amber-50 dark:bg-amber-500/10"
        : "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"

  const btnColor =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : variant === "warning"
        ? "bg-amber-600 hover:bg-amber-700 text-white"
        : "bg-indigo-650 hover:bg-indigo-700 text-white"

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onCancel}>
      <div
        className="bg-card border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${iconColor}`}>
            <AlertTriangle className="h-5.5 w-5.5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-105 text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground leading-normal">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-850">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-muted transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`h-9 px-4 rounded-xl text-xs font-black transition-all shadow-sm ${btnColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
