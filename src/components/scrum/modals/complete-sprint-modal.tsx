"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Zap, CheckCircle2, XCircle, Target, Timer, TrendingUp, ArrowRight, Inbox, ChevronDown
} from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { format, differenceInDays } from "date-fns"

interface SprintTask {
  id: string
  key: string
  title: string
  status: string
  storyPoints: number | null
  type: string
  assignees: { name: string | null; email: string }[]
}

interface SprintSummaryData {
  id: string
  name: string
  goal: string | null
  startDate: string | null
  endDate: string | null
  tasks: SprintTask[]
}

interface CompleteSprintModalProps {
  projectId: string
  sprint: SprintSummaryData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
  sprints: { id: string; name: string; status: string }[]
}

export function CompleteSprintModal({
  projectId,
  sprint,
  open,
  onOpenChange,
  onCompleted,
  sprints,
}: CompleteSprintModalProps) {
  const router = useRouter()
  const qc = useQueryClient()
  const [moveTo, setMoveTo] = useState<"backlog" | string>("backlog")

  const completedTasks = useMemo(() => sprint?.tasks.filter((t) => t.status === "DONE") || [], [sprint])
  const incompleteTasks = useMemo(() => sprint?.tasks.filter((t) => t.status !== "DONE") || [], [sprint])

  const totalPoints = sprint?.tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0) || 0
  const completedPoints = completedTasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0)

  const now = new Date()
  const start = sprint?.startDate ? new Date(sprint.startDate) : now
  const end = sprint?.endDate ? new Date(sprint.endDate) : now
  const totalDays = Math.max(1, differenceInDays(end, start))
  const elapsedDays = Math.max(0, Math.min(totalDays, differenceInDays(now, start)))

  const nextSprints = sprints.filter((s) => s.id !== sprint?.id && s.status !== "COMPLETED")

  const completeSprint = useMutation({
    mutationFn: async () => {
      // 1. Complete the sprint
      const res = await fetch(`/api/scrum/sprints/${sprint?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      })
      if (!res.ok) throw new Error("Failed to complete sprint")

      // 2. Move incomplete tasks to selected destination
      if (incompleteTasks.length > 0 && moveTo !== "backlog") {
        await fetch(`/api/projects/${projectId}/scrum/tasks/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            taskIds: incompleteTasks.map((t) => t.id),
            sprintId: moveTo,
          }),
        })
      } else if (incompleteTasks.length > 0) {
        await fetch(`/api/projects/${projectId}/scrum/tasks/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            taskIds: incompleteTasks.map((t) => t.id),
            sprintId: null,
          }),
        })
      }

      return { success: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scrum", projectId] })
      toast.success(`${sprint?.name} completed successfully`)
      onCompleted()
      onOpenChange(false)
    },
    onError: () => {
      toast.error("Failed to complete sprint")
    },
  })

  if (!sprint) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amber-500" />
            Complete Sprint: {sprint.name}
          </DialogTitle>
          <DialogDescription>
            Review sprint progress and choose what to do with incomplete issues.
          </DialogDescription>
        </DialogHeader>

        {/* Sprint Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
          <StatCard
            icon={<Timer className="h-4 w-4 text-blue-500" />}
            label="Duration"
            value={`${elapsedDays}d / ${totalDays}d`}
          />
          <StatCard
            icon={<Target className="h-4 w-4 text-indigo-500" />}
            label="Story Points"
            value={`${completedPoints} / ${totalPoints}`}
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            label="Completed"
            value={`${completedTasks.length} issues`}
          />
          <StatCard
            icon={<XCircle className="h-4 w-4 text-rose-500" />}
            label="Incomplete"
            value={`${incompleteTasks.length} issues`}
          />
        </div>

        {/* Velocity */}
        <div className="rounded-lg bg-slate-50 p-3 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-bold text-slate-800">Velocity: {completedPoints} points</p>
            <p className="text-xs text-slate-500">
              {completedTasks.length} of {sprint.tasks.length} issues completed
              {completedPoints > 0 && totalPoints > 0 && ` (${Math.round((completedPoints / totalPoints) * 100)}%)`}
            </p>
          </div>
        </div>

        {/* Completed Issues */}
        {completedTasks.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed Issues
            </h4>
            <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-lg border border-slate-100">
              {completedTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {/* Incomplete Issues */}
        {incompleteTasks.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-2 flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5" /> Incomplete Issues
            </h4>
            <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-lg border border-slate-100 mb-3">
              {incompleteTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>

            {/* Move incomplete to */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Move incomplete issues to:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setMoveTo("backlog")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors",
                    moveTo === "backlog"
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Inbox className="h-3.5 w-3.5" /> Backlog
                </button>
                {nextSprints.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setMoveTo(s.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors",
                      moveTo === s.id
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <ArrowRight className="h-3.5 w-3.5" /> {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => completeSprint.mutate()}
            disabled={completeSprint.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {completeSprint.isPending ? "Completing…" : "Complete Sprint"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-card p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function TaskRow({ task }: { task: SprintTask }) {
  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      TODO: "bg-slate-100 text-slate-600",
      IN_PROGRESS: "bg-blue-100 text-blue-700",
      REVIEW: "bg-violet-100 text-violet-700",
      TESTING: "bg-amber-100 text-amber-700",
      DONE: "bg-emerald-100 text-emerald-700",
    }
    return map[status] || "bg-slate-100 text-slate-600"
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50/40 transition-colors border-b border-slate-50 last:border-0">
      <span className="shrink-0 font-mono text-xs font-bold text-primary">{task.key}</span>
      <span className="flex-1 truncate text-xs font-medium text-slate-700">{task.title}</span>
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold shrink-0", statusColor(task.status))}>
        {task.status.replace("_", " ")}
      </span>
      {task.storyPoints != null && (
        <span className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-600">
          {task.storyPoints}
        </span>
      )}
    </div>
  )
}
