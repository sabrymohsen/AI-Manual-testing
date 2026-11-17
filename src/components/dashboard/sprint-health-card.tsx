"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Zap, Timer, Target, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { format, differenceInDays } from "date-fns"

interface SprintHealth {
  id: string
  name: string
  goal: string | null
  status: string
  startDate: string | null
  endDate: string | null
  totalPoints: number
  completedPoints: number
  totalIssues: number
  completedIssues: number
}

export function SprintHealthCard({ projectId }: { projectId: string }) {
  const [sprint, setSprint] = useState<SprintHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    fetch(`/api/projects/${projectId}/scrum/sprints`)
      .then((r) => (r.ok ? r.json() : { sprints: [] }))
      .then((data) => {
        const active = (data.sprints || []).find((s: any) => s.status === "ACTIVE")
        if (!active) {
          setSprint(null)
          return
        }
        // Fetch sprint details with story points
        return fetch(`/api/projects/${projectId}/scrum/sprints/${active.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((detail) => {
            const tasks = detail?.sprint?.tasks || []
            const totalPoints = tasks.reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0)
            const completedPoints = tasks
              .filter((t: any) => t.status === "DONE")
              .reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0)
            setSprint({
              id: active.id,
              name: active.name,
              goal: active.goal,
              status: active.status,
              startDate: active.startDate,
              endDate: active.endDate,
              totalPoints,
              completedPoints,
              totalIssues: tasks.length,
              completedIssues: tasks.filter((t: any) => t.status === "DONE").length,
            })
          })
      })
      .catch(() => setSprint(null))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    )
  }

  if (!sprint) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-medium text-foreground">Sprint Health</span>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">No active sprint. Start one from the Scrum Board.</p>
      </div>
    )
  }

  const now = new Date()
  const start = sprint.startDate ? new Date(sprint.startDate) : now
  const end = sprint.endDate ? new Date(sprint.endDate) : now
  const totalDays = Math.max(1, differenceInDays(end, start))
  const elapsedDays = Math.max(0, Math.min(totalDays, differenceInDays(now, start)))
  const remainingDays = Math.max(0, differenceInDays(end, now))
  const timeProgress = Math.round((elapsedDays / totalDays) * 100)
  const workProgress = sprint.totalPoints > 0 ? Math.round((sprint.completedPoints / sprint.totalPoints) * 100) : 0

  const isAhead = workProgress >= timeProgress
  const isAtRisk = remainingDays <= 2 && workProgress < 80

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-medium text-foreground">Sprint Health</span>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">{sprint.name}</h3>
        {sprint.goal && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{sprint.goal}</p>}
      </div>

      {/* Time progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> Time</span>
          <span>{elapsedDays}d / {totalDays}d ({remainingDays}d left)</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", isAtRisk ? "bg-red-500" : "bg-blue-500")} style={{ width: `${timeProgress}%` }} />
        </div>
      </div>

      {/* Work progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1"><Target className="h-3 w-3" /> Story Points</span>
          <span>{sprint.completedPoints} / {sprint.totalPoints} pts</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", isAhead ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${workProgress}%` }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 pt-2 border-t">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">{sprint.totalIssues}</p>
          <p className="text-[11px] font-medium text-muted-foreground">Issues</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-emerald-600">{sprint.completedIssues}</p>
          <p className="text-[11px] font-medium text-muted-foreground">Done</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">{remainingDays}</p>
          <p className="text-[11px] font-medium text-muted-foreground">Days Left</p>
        </div>
      </div>

      {/* Health indicator */}
      <div className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold",
        isAtRisk ? "bg-red-50 text-red-700" : isAhead ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      )}>
        {isAtRisk ? <TrendingDown className="h-3.5 w-3.5" /> : isAhead ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
        {isAtRisk ? "At risk — low progress, few days remaining" : isAhead ? "On track — ahead of schedule" : "Behind — work pace slower than time"}
      </div>
    </div>
  )
}
