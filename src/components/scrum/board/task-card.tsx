"use client"

import { useState, useRef } from "react"
import type { ScrumTask } from "@/types/scrum"
import { AvatarStack, overdueDays, STATUS_META, PriorityIcon, DotLabel, TYPE_DOT } from "@/components/scrum/shared"
import { TYPE_META } from "@/components/scrum/task/task-detail-config"
import { MessageSquare, GitBranch, CalendarClock, User, Tag, Hash, Ban } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { useUpdateTask, useScrumMembers, useBoardColumns } from "@/hooks/scrum/use-scrum"
import { useCurrentUser } from "@/hooks/scrum/use-scrum"

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
  const blocked = !!task.signals?.blocked
  const tests = task.signals?.tests

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
        "group relative cursor-pointer select-none rounded-md border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-foreground/20",
        layout === "compact" ? "px-3 py-2" : "p-3",
        dragging && "border-primary/40 shadow-lg ring-1 ring-primary/30"
      )}
    >
      {/* Quick-edit hover overlay */}
      {hovered && !dragging && (
        <div
          className="absolute right-2 top-1.5 z-10 flex items-center gap-0.5 rounded-md border border-border bg-card px-0.5 py-0.5 shadow-sm"
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
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-md">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Assignee</p>
                {currentUser && (
                  <button
                    onClick={assignToMe}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors",
                      isAssignedToMe ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"
                    )}
                  >
                    <span className="h-5 w-5 rounded-full bg-primary text-xs font-semibold text-white flex items-center justify-center">
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
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors",
                      task.assignees.some((a) => a.id === m.id) ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"
                    )}
                  >
                    <span className="h-5 w-5 rounded-full bg-muted text-xs font-semibold text-foreground flex items-center justify-center">
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
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-card p-2 shadow-md">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Status</p>
                {columns?.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => setStatus(col.status)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors",
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
              <div className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-border bg-card p-2 shadow-md">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Story points</p>
                <div className="grid grid-cols-4 gap-1">
                  {[null, 1, 2, 3, 5, 8, 13, 21].map((pts) => (
                    <button
                      key={pts ?? "null"}
                      onClick={() => setPoints(pts)}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
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

      {/* Row 1: key + assignees */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{task.key}</span>
        {layout === "compact" && <PriorityIcon priority={task.priority} />}
        <span className="ml-auto flex items-center">
          {task.assignees.length > 0 && <AvatarStack members={task.assignees} max={layout === "compact" ? 1 : 2} size="sm" />}
        </span>
      </div>

      {/* Title */}
      <p
        className={cn(
          "mt-2 text-xs font-medium leading-snug text-foreground",
          layout === "compact" ? "line-clamp-1" : "line-clamp-2"
        )}
      >
        {task.title}
      </p>

      {layout === "compact" ? (
        (blocked || overdue !== null || (task.storyPoints != null && !hideEstimations)) && (
          <div className="mt-2 flex items-center gap-2">
            {blocked && <BlockedChip />}
            {overdue !== null && <OverdueChip days={overdue} />}
            {task.storyPoints != null && !hideEstimations && <PointsChip points={task.storyPoints} />}
          </div>
        )
      ) : (
        <>
          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded border border-border"
              title={`Priority: ${task.priority.toLowerCase()}`}
            >
              <PriorityIcon priority={task.priority} />
            </span>
            {task.storyPoints != null && !hideEstimations && <PointsChip points={task.storyPoints} />}
            <DotLabel dotClass={TYPE_DOT[task.type]}>{TYPE_META[task.type]?.label ?? task.type}</DotLabel>
            {task.epic && <DotLabel dotColor={task.epic.color} className="max-w-[8.5rem]">{task.epic.title}</DotLabel>}
            {blocked && <BlockedChip />}
            {overdue !== null && <OverdueChip days={overdue} />}
            {task.branchName && (
              <span className="inline-flex h-5 max-w-[9rem] items-center gap-1 rounded border border-border px-2 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.branchName}</span>
              </span>
            )}
            {task.commentCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground" title={`${task.commentCount} comment(s)`}>
                <MessageSquare className="h-3 w-3" />
                {task.commentCount}
              </span>
            )}
          </div>

          {/* One progress line: test results win over subtasks */}
          {tests && tests.total > 0 ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" title={`${tests.total} executed test case(s)`}>
              {tests.passed > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {tests.passed} passed
                </span>
              )}
              {tests.failed > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {tests.failed} failed
                </span>
              )}
              {tests.total - tests.passed - tests.failed > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {tests.total - tests.passed - tests.failed} other
                </span>
              )}
              <span className="flex h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="h-full bg-emerald-500" style={{ width: `${(tests.passed / tests.total) * 100}%` }} />
                <span className="h-full bg-red-500" style={{ width: `${(tests.failed / tests.total) * 100}%` }} />
                <span className="h-full bg-amber-500" style={{ width: `${((tests.total - tests.passed - tests.failed) / tests.total) * 100}%` }} />
              </span>
            </div>
          ) : (
            total > 0 &&
            !hideSubtasks && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Subtasks {done}/{total}
                </span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
                </span>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

function PointsChip({ points }: { points: number }) {
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border px-2 text-xs tabular-nums text-muted-foreground"
      title={`${points} story point(s)`}
    >
      {points}
    </span>
  )
}

function BlockedChip() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-400">
      <Ban className="h-3 w-3" />
      Blocked
    </span>
  )
}

function OverdueChip({ days }: { days: number }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
      <CalendarClock className="h-3 w-3" />
      {days}d overdue
    </span>
  )
}
