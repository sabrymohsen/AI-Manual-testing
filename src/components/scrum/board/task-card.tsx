"use client"

import type { ScrumTask } from "@/types/scrum"
import { PriorityBadge, AvatarStack, overdueDays } from "@/components/scrum/shared"
import { MessageSquare, GitBranch, CalendarClock, CheckSquare, FlaskConical, Bug } from "lucide-react"
import { cn } from "@/lib/utils"

export function TaskCard({
  task,
  onClick,
  dragging,
}: {
  task: ScrumTask
  onClick?: () => void
  dragging?: boolean
}) {
  const done = task.subtasks.filter((s) => s.completed).length
  const total = task.subtasks.length
  const overdue = overdueDays(task.dueDate, task.status)

  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer select-none rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        dragging && "rotate-1 shadow-lg ring-2 ring-primary/30"
      )}
    >
      {/* Top row: id + priority */}
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
          {task.key}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Title */}
      <p className="mb-2 line-clamp-2 text-sm font-medium leading-snug text-foreground">{task.title}</p>

      {/* Epic tag */}
      {task.epic && (
        <span
          className="mb-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: `${task.epic.color}1a`, color: task.epic.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.epic.color }} />
          {task.epic.title}
        </span>
      )}

      {/* Subtask progress */}
      {total > 0 && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <CheckSquare className="h-3 w-3" /> {done}/{total}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Meta chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {task.branchName && (
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
            <GitBranch className="h-3 w-3" />
            {task.branchName}
          </span>
        )}
        {overdue !== null && (
          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            <CalendarClock className="h-3 w-3" />
            Overdue {overdue}d
          </span>
        )}
        {task.storyPoints != null && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
            {task.storyPoints}
          </span>
        )}
      </div>

      {/* Footer: comments + assignees */}
      <div className="mt-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {task.commentCount}
          </span>
          {!!task.testCaseCount && (
            <span className="inline-flex items-center gap-0.5 text-emerald-600" title={`${task.testCaseCount} linked test case(s)`}>
              <FlaskConical className="h-3.5 w-3.5" />
              {task.testCaseCount}
            </span>
          )}
          {!!task.bugCount && (
            <span className="inline-flex items-center gap-0.5 text-red-600" title={`${task.bugCount} linked bug(s)`}>
              <Bug className="h-3.5 w-3.5" />
              {task.bugCount}
            </span>
          )}
        </span>
        {task.assignees.length > 0 && <AvatarStack members={task.assignees} />}
      </div>
    </div>
  )
}
