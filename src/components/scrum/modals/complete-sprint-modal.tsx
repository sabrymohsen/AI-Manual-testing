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
import { STATUS_META } from "@/components/scrum/shared"
import type { TaskStatus } from "@/types/scrum"
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


/** Deployed counts as finished, the same as everywhere else on the board. */
const isFinished = (status: string) => status === "DONE" || status === "DEPLOYED"

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

  const completedTasks = useMemo(() => sprint?.tasks.filter((t) => isFinished(t.status)) || [], [sprint])
  const incompleteTasks = useMemo(() => sprint?.tasks.filter((t) => !isFinished(t.status)) || [], [sprint])

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

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
  const pointsPct = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : null

  const choice = (active: boolean) =>
    cn(
      "button-sm inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b border-border p-6">
          <DialogTitle className="heading-6 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" aria-hidden />
            Complete {sprint.name}
          </DialogTitle>
          <DialogDescription className="body-6">Review the sprint and choose where unfinished issues go.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={<Timer className="h-4 w-4 text-blue-500" />} label="Days" value={`${elapsedDays} of ${totalDays}`} />
            <StatCard icon={<Target className="h-4 w-4 text-indigo-500" />} label="Story points done" value={`${completedPoints} of ${totalPoints}`} />
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="Finished" value={plural(completedTasks.length, "issue")} />
            <StatCard icon={<XCircle className="h-4 w-4 text-rose-500" />} label="Unfinished" value={plural(incompleteTasks.length, "issue")} />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <TrendingUp className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            <div>
              <p className="title-4 text-foreground">Velocity: {plural(completedPoints, "point")}</p>
              <p className="caption-5 text-muted-foreground">
                {completedTasks.length} of {plural(sprint.tasks.length, "issue")} finished
                {pointsPct !== null && ` · ${pointsPct}% of story points`}
              </p>
            </div>
          </div>

          {completedTasks.length > 0 && (
            <section className="space-y-2">
              <h4 className="title-4 flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden /> Finished issues
              </h4>
              <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                {completedTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </section>
          )}

          {incompleteTasks.length > 0 && (
            <section className="space-y-2">
              <h4 className="title-4 flex items-center gap-2 text-foreground">
                <XCircle className="h-4 w-4 text-rose-500" aria-hidden /> Unfinished issues
              </h4>
              <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                {incompleteTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
              <fieldset className="space-y-2 pt-2">
                <legend className="caption-1 mb-2 text-foreground">Move unfinished issues to</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={moveTo === "backlog"} onClick={() => setMoveTo("backlog")} className={choice(moveTo === "backlog")}>
                    <Inbox className="h-4 w-4" aria-hidden /> Backlog
                  </button>
                  {nextSprints.map((s) => (
                    <button key={s.id} type="button" aria-pressed={moveTo === s.id} onClick={() => setMoveTo(s.id)} className={choice(moveTo === s.id)}>
                      <ArrowRight className="h-4 w-4" aria-hidden /> {s.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-background p-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => completeSprint.mutate()} disabled={completeSprint.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {completeSprint.isPending ? "Completing…" : "Complete sprint"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="mb-2 flex justify-center">{icon}</div>
      <p className="title-2 text-foreground">{value}</p>
      <p className="caption-5 text-muted-foreground">{label}</p>
    </div>
  )
}

function TaskRow({ task }: { task: SprintTask }) {
  const meta = STATUS_META[task.status as TaskStatus]
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
      <span className="shrink-0 font-mono text-xs font-semibold text-primary">{task.key}</span>
      <span className="caption-2 flex-1 truncate text-foreground">{task.title}</span>
      <span className="caption-4 inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-2 py-0.5 text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", meta?.dot ?? "bg-slate-400")} aria-hidden />
        {meta?.label ?? task.status}
      </span>
      {task.storyPoints != null && (
        <span className="caption-3 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-2 text-muted-foreground">
          {task.storyPoints}
        </span>
      )}
    </div>
  )
}
