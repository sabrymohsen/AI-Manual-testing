"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Layers, CheckCircle2, Target, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface EpicData {
  id: string
  title: string
  description: string | null
  color: string
  tasks: EpicTask[]
}

interface EpicTask {
  id: string
  key: string
  title: string
  status: string
  storyPoints: number | null
}

export function EpicReport({ projectId }: { projectId: string }) {
  const [epics, setEpics] = useState<EpicData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    Promise.all([
      fetch(`/api/projects/${projectId}/scrum/epics`).then((r) => (r.ok ? r.json() : { epics: [] })),
      fetch(`/api/projects/${projectId}/scrum/tasks?limit=500`).then((r) => (r.ok ? r.json() : { tasks: [] })),
    ])
      .then(([epicsData, tasksData]) => {
        const epicList = (epicsData.epics || []).slice(0, 50)
        const tasks = tasksData.tasks || []

        const enriched = epicList.map((epic: any) => {
          const epicTasks = tasks.filter((t: any) => t.epicId === epic.id)
          return {
            id: epic.id,
            title: epic.title,
            description: epic.description,
            color: epic.color || "#6366f1",
            tasks: epicTasks.map((t: any) => ({
              id: t.id,
              key: t.key,
              title: t.title,
              status: t.status,
              storyPoints: t.storyPoints,
            })),
          }
        })

        setEpics(enriched.sort((a: EpicData, b: EpicData) => b.tasks.length - a.tasks.length))
      })
      .catch(() => setEpics([]))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (epics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Layers className="h-8 w-8 text-slate-200" />
        <p className="text-xs text-muted-foreground font-medium">No epics found in this project.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {epics.map((epic) => {
        const total = epic.tasks.length
        const completed = epic.tasks.filter((t) => t.status === "DONE").length
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0
        const totalPoints = epic.tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0)
        const completedPoints = epic.tasks
          .filter((t) => t.status === "DONE")
          .reduce((sum, t) => sum + (t.storyPoints || 0), 0)

        return (
          <div key={epic.id} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Epic header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${epic.color}1a` }}
              >
                <Layers className="h-4 w-4" style={{ color: epic.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-foreground">{epic.title}</h4>
                {epic.description && (
                  <p className="text-[11px] text-muted-foreground truncate">{epic.description}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-semibold text-foreground">{progress}%</p>
                <p className="text-[10px] text-muted-foreground">{completed}/{total} issues</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-4 py-2">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    progress === 100 ? "bg-emerald-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 px-4 pb-3">
              <div className="text-center rounded-lg bg-muted/50 py-2">
                <p className="text-sm font-semibold text-foreground">{total}</p>
                <p className="text-[11px] font-medium text-muted-foreground">Total Issues</p>
              </div>
              <div className="text-center rounded-lg bg-emerald-50 py-2">
                <p className="text-sm font-semibold text-emerald-700">{completed}</p>
                <p className="text-[11px] font-medium text-emerald-500">Completed</p>
              </div>
              <div className="text-center rounded-lg bg-blue-50 py-2">
                <p className="text-sm font-semibold text-blue-700">{totalPoints > 0 ? `${completedPoints}/${totalPoints}` : "—"}</p>
                <p className="text-[11px] font-medium text-blue-500">Story Points</p>
              </div>
            </div>

            {/* Task list (collapsed by default, show first 3) */}
            {epic.tasks.length > 0 && (
              <div className="border-t divide-y divide-slate-50">
                {epic.tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/40 transition-colors">
                    <span className="shrink-0 font-mono text-[10px] font-semibold text-primary">{task.key}</span>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">{task.title}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0",
                        task.status === "DONE"
                          ? "bg-emerald-100 text-emerald-700"
                          : task.status === "IN_PROGRESS"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {task.status.replace("_", " ")}
                    </span>
                    {task.storyPoints != null && (
                      <span className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                        {task.storyPoints}
                      </span>
                    )}
                  </div>
                ))}
                {epic.tasks.length > 5 && (
                  <div className="px-4 py-2 text-center">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      +{epic.tasks.length - 5} more issues
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
