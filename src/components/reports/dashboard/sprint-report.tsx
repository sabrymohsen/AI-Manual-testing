"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Zap, CheckCircle2, XCircle, Timer, Target, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { format, differenceInDays } from "date-fns"

interface SprintReportData {
  id: string
  name: string
  goal: string | null
  status: string
  startDate: string | null
  endDate: string | null
  tasks: SprintTask[]
}

interface SprintTask {
  id: string
  key: string
  title: string
  type: string
  status: string
  priority: string
  storyPoints: number | null
  assignees: { name: string | null; email: string }[]
}

export function SprintReport({ projectId }: { projectId: string }) {
  const [sprints, setSprints] = useState<SprintReportData[]>([])
  const [activeSprintId, setActiveSprintId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    fetch(`/api/projects/${projectId}/scrum/sprints`)
      .then((r) => (r.ok ? r.json() : { sprints: [] }))
      .then(async (data) => {
        const sprintList = (data.sprints || []).slice(0, 10)
        const enriched = await Promise.all(
          sprintList.map(async (s: any) => {
            const detail = await fetch(`/api/projects/${projectId}/scrum/sprints/${s.id}`).then((r) =>
              r.ok ? r.json() : { sprint: { tasks: [] } }
            )
            return {
              id: s.id,
              name: s.name,
              goal: s.goal,
              status: s.status,
              startDate: s.startDate,
              endDate: s.endDate,
              tasks: (detail.sprint?.tasks || []).map((t: any) => ({
                id: t.id,
                key: t.key,
                title: t.title,
                type: t.type,
                status: t.status,
                priority: t.priority,
                storyPoints: t.storyPoints,
                assignees: t.assignees || [],
              })),
            }
          })
        )
        setSprints(enriched)
        const active = enriched.find((s) => s.status === "ACTIVE")
        if (active) setActiveSprintId(active.id)
        else if (enriched.length > 0) setActiveSprintId(enriched[0].id)
      })
      .catch(() => setSprints([]))
      .finally(() => setLoading(false))
  }, [projectId])

  const activeSprint = sprints.find((s) => s.id === activeSprintId)

  const completedTasks = activeSprint?.tasks.filter((t) => t.status === "DONE") || []
  const notCompletedTasks = activeSprint?.tasks.filter((t) => t.status !== "DONE") || []
  const totalPoints = activeSprint?.tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0) || 0
  const completedPoints = completedTasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0)

  const now = new Date()
  const start = activeSprint?.startDate ? new Date(activeSprint.startDate) : now
  const end = activeSprint?.endDate ? new Date(activeSprint.endDate) : now
  const totalDays = Math.max(1, differenceInDays(end, start))
  const elapsedDays = Math.max(0, Math.min(totalDays, differenceInDays(now, start)))
  const remainingDays = Math.max(0, differenceInDays(end, now))
  const timeProgress = Math.round((elapsedDays / totalDays) * 100)
  const workProgress = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0
  const isAhead = workProgress >= timeProgress

  return (
    <div className="space-y-4">
      {/* Sprint selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Sprint</span>
        <select
          value={activeSprintId}
          onChange={(e) => setActiveSprintId(e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold"
        >
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.status === "ACTIVE" ? "(Active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !activeSprint ? (
        <p className="text-xs text-muted-foreground text-center py-8">No sprints found for this project.</p>
      ) : (
        <>
          {/* Sprint summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-100 bg-card p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase">
                <Timer className="h-3 w-3" /> Time
              </div>
              <p className="text-lg font-extrabold text-slate-800">{elapsedDays}d / {totalDays}d</p>
              <p className="text-[10px] text-slate-400">{remainingDays} days remaining</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-card p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase">
                <Target className="h-3 w-3" /> Story Points
              </div>
              <p className="text-lg font-extrabold text-slate-800">{completedPoints} / {totalPoints}</p>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={cn("h-full rounded-full", isAhead ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${workProgress}%` }} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-card p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Completed
              </div>
              <p className="text-lg font-extrabold text-emerald-600">{completedTasks.length}</p>
              <p className="text-[10px] text-slate-400">{completedPoints} pts</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-card p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase">
                <XCircle className="h-3 w-3 text-rose-500" /> Not Done
              </div>
              <p className="text-lg font-extrabold text-rose-600">{notCompletedTasks.length}</p>
              <p className="text-[10px] text-slate-400">{totalPoints - completedPoints} pts remaining</p>
            </div>
          </div>

          {/* Completed issues */}
          {completedTasks.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Completed Issues</span>
                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{completedTasks.length}</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
                {completedTasks.map((task) => (
                  <SprintTaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Not completed issues */}
          {notCompletedTasks.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <XCircle className="h-4 w-4 text-rose-500" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Issues Not Completed</span>
                <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">{notCompletedTasks.length}</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
                {notCompletedTasks.map((task) => (
                  <SprintTaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SprintTaskRow({ task }: { task: SprintTask }) {
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
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/40 transition-colors">
      <span className="shrink-0 font-mono text-[10px] font-bold text-primary">{task.key}</span>
      <span className="flex-1 truncate text-xs font-medium text-slate-700">{task.title}</span>
      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0", statusColor(task.status))}>
        {task.status.replace("_", " ")}
      </span>
      {task.storyPoints != null && (
        <span className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
          {task.storyPoints}
        </span>
      )}
      <span className="shrink-0 text-[10px] text-slate-400">
        {task.assignees.map((a) => a.name || a.email).join(", ") || "Unassigned"}
      </span>
    </div>
  )
}
