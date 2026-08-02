"use client"

import { useState, useRef } from "react"
import type { ScrumTask } from "@/types/scrum"
import { PriorityBadge, AvatarStack, overdueDays, STATUS_META } from "@/components/scrum/shared"
import { MessageSquare, GitBranch, CalendarClock, CheckSquare, FlaskConical, Bug, User, Tag, Hash } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUpdateTask, useScrumMembers, useBoardColumns } from "@/hooks/scrum/use-scrum"
import { useCurrentUser } from "@/hooks/scrum/use-scrum"

/**
 * Left accent stripe per issue type. Hues intentionally match TYPE_META in
 * task-detail-config.ts so a card, the drawer, and the Create menu all agree
 * on what colour a Bug (or Story, or Test Case) is.
 */
const TYPE_COLORS: Record<string, string> = {
  STORY: "border-l-green-600",
  BUG: "border-l-red-600",
  TASK: "border-l-blue-600",
  TEST_CASE: "border-l-teal-600",
  SUBTASK: "border-l-sky-600",
  EPIC: "border-l-purple-600",
}

export function TaskCard({
  task,
  onClick,
  dragging,
  projectId,
  layout = "detailed",
  hideEstimations = false,
  hideSubtasks = false,
}: {
  task: ScrumTask
  onClick?: () => void
  dragging?: boolean
  projectId: string
  layout?: "compact" | "detailed"
  hideEstimations?: boolean
  hideSubtasks?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [quickAction, setQuickAction] = useState<"assignee" | "status" | "points" | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const update = useUpdateTask(projectId)
  const { data: currentUser } = useCurrentUser()
  const { data: members } = useScrumMembers(projectId)
  const { data: columns } = useBoardColumns(projectId)

  const done = task.subtasks.filter((s) => s.completed).length
  const total = task.subtasks.length
  const overdue = overdueDays(task.dueDate, task.status)
  const typeBorder = TYPE_COLORS[task.type] || "border-l-transparent"

  const isAssignedToMe = currentUser ? task.assignees.some((a) => a.id === currentUser.id) : false

  function assignToMe(e: React.MouseEvent) {
    e.stopPropagation()
    if (!currentUser) return
    const next = isAssignedToMe
      ? task.assignees.filter((a) => a.id !== currentUser.id)
      : [...task.assignees, { id: currentUser.id, name: currentUser.name, email: currentUser.email }]
    update.mutate({ taskId: task.id, body: { assigneeIds: next.map((a) => a.id) } })
    setQuickAction(null)
  }

  function setStatus(status: string) {
    update.mutate({ taskId: task.id, body: { status } })
    setQuickAction(null)
  }

  function setPoints(points: number | null) {
    update.mutate({ taskId: task.id, body: { storyPoints: points } })
    setQuickAction(null)
  }

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setQuickAction(null) }}
      className={cn(
        "relative cursor-pointer select-none rounded-md border border-border bg-card transition-shadow hover:shadow-sm border-l-4",
        layout === "compact" ? "p-2" : "p-3",
        typeBorder,
        dragging && "rotate-1 shadow-lg ring-2 ring-primary/30"
      )}
    >
      {/* Quick-edit hover overlay */}
      {hovered && !dragging && (
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-card/95 px-1 py-0.5 shadow-sm backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Assignee quick action */}
          <div className="relative">
            <button
              onClick={() => setQuickAction(quickAction === "assignee" ? null : "assignee")}
              className={cn(
                "rounded p-1 transition-colors",
                quickAction === "assignee" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title="Change assignee"
            >
              <User className="h-3.5 w-3.5" />
            </button>
            {quickAction === "assignee" && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-card p-1.5 shadow-md">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assignee</p>
                {currentUser && (
                  <button
                    onClick={assignToMe}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      isAssignedToMe ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"
                    )}
                  >
                    <span className="h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                      {currentUser.name?.[0] || currentUser.email[0]}
                    </span>
                    {isAssignedToMe ? "Assigned to me" : "Assign to me"}
                  </button>
                )}
                <div className="my-1 border-t border-border" />
                {members?.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      const isAssigned = task.assignees.some((a) => a.id === m.id)
                      const next = isAssigned
                        ? task.assignees.filter((a) => a.id !== m.id)
                        : [...task.assignees, m]
                      update.mutate({ taskId: task.id, body: { assigneeIds: next.map((a) => a.id) } })
                      setQuickAction(null)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      task.assignees.some((a) => a.id === m.id) ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"
                    )}
                  >
                    <span className="h-5 w-5 rounded-full bg-muted text-[10px] font-bold text-foreground flex items-center justify-center">
                      {m.name?.[0] || m.email[0]}
                    </span>
                    {m.name || m.email}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status quick action */}
          <div className="relative">
            <button
              onClick={() => setQuickAction(quickAction === "status" ? null : "status")}
              className={cn(
                "rounded p-1 transition-colors",
                quickAction === "status" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title="Change status"
            >
              <Tag className="h-3.5 w-3.5" />
            </button>
            {quickAction === "status" && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-card p-1.5 shadow-md">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
                {columns?.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => setStatus(col.status)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      task.status === col.status ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"
                    )}
                  >
                    {/* Single source of truth — this used to be an inline
                        status→colour ladder that had drifted out of sync with
                        STATUS_META (TODO was slate there, grey here). */}
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        STATUS_META[col.status]?.dot ?? "bg-muted-foreground"
                      )}
                    />
                    {col.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Story points quick action */}
          <div className="relative">
            <button
              onClick={() => setQuickAction(quickAction === "points" ? null : "points")}
              className={cn(
                "rounded p-1 transition-colors",
                quickAction === "points" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title="Edit story points"
            >
              <Hash className="h-3.5 w-3.5" />
            </button>
            {quickAction === "points" && (
              <div className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-border bg-card p-1.5 shadow-md">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Story Points</p>
                <div className="grid grid-cols-4 gap-1">
                  {[null, 1, 2, 3, 5, 8, 13, 21].map((pts) => (
                    <button
                      key={pts ?? "null"}
                      onClick={() => setPoints(pts)}
                      className={cn(
                        "rounded-md px-1.5 py-1 text-xs font-semibold transition-colors",
                        task.storyPoints === pts
                          ? "bg-primary text-white"
                          : "bg-muted hover:bg-accent text-muted-foreground"
                      )}
                    >
                      {pts ?? "—"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top row: id + priority */}
      <div className={cn("flex items-center justify-between", layout === "compact" ? "mb-1" : "mb-2")}>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
          {task.key}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Title */}
      <p className={cn(
        "text-sm font-medium leading-snug text-foreground",
        layout === "compact" ? "mb-1 line-clamp-1" : "mb-2 line-clamp-2"
      )}>
        {task.title}
      </p>

      {/* Epic tag — detailed only */}
      {layout === "detailed" && task.epic && (
        <span
          className="mb-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: `${task.epic.color}1a`, color: task.epic.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.epic.color }} />
          {task.epic.title}
        </span>
      )}

      {/* Subtask progress — detailed only, unless hidden */}
      {layout === "detailed" && total > 0 && !hideSubtasks && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <CheckSquare className="h-3 w-3" /> {done}/{total}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Meta chips — detailed only */}
      {layout === "detailed" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.branchName && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              <GitBranch className="h-3 w-3" />
              {task.branchName}
            </span>
          )}
          {overdue !== null && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              <CalendarClock className="h-3 w-3" />
              Overdue {overdue}d
            </span>
          )}
          {task.storyPoints != null && !hideEstimations && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
              {task.storyPoints}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={cn("flex items-center justify-between", layout === "compact" ? "mt-1" : "mt-2")}>
        {layout === "detailed" ? (
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
              <span className="inline-flex items-center gap-0.5 text-destructive" title={`${task.bugCount} linked bug(s)`}>
                <Bug className="h-3.5 w-3.5" />
                {task.bugCount}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            {task.storyPoints != null && !hideEstimations && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {task.storyPoints}
              </span>
            )}
            {overdue !== null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive">
                <CalendarClock className="h-3 w-3" />
                {overdue}d
              </span>
            )}
          </span>
        )}
        {task.assignees.length > 0 && <AvatarStack members={task.assignees} max={layout === "compact" ? 1 : 2} />}
      </div>
    </div>
  )
}
