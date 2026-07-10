"use client"

import { useMemo } from "react"
import type { TaskFilters, ScrumTask } from "@/types/scrum"
import { useScrumTasks } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { STATUS_META, PriorityBadge } from "@/components/scrum/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { differenceInCalendarDays, format, addDays } from "date-fns"

const DAY_W = 34 // px per day

export function TimelineView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const { data: tasks, isLoading } = useScrumTasks(projectId, filters)
  const { openTask } = useScrumUI()

  const model = useMemo(() => {
    const dated = (tasks ?? []).filter((t) => t.dueDate) as ScrumTask[]
    if (dated.length === 0) return null
    const dueDates = dated.map((t) => new Date(t.dueDate!).getTime())
    const createdDates = dated.map((t) => new Date(t.createdAt).getTime())
    const min = new Date(Math.min(...createdDates, ...dueDates))
    const max = new Date(Math.max(...dueDates))
    const start = addDays(min, -1)
    const end = addDays(max, 1)
    const totalDays = Math.max(differenceInCalendarDays(end, start) + 1, 1)
    return { dated, start, end, totalDays }
  }, [tasks])

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!model) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
        No tasks with due dates to plot. Add a due date to see it on the timeline.
      </div>
    )
  }

  const { dated, start, totalDays } = model
  const today = differenceInCalendarDays(new Date(), start)

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div style={{ width: 260 + totalDays * DAY_W }}>
        {/* Date header */}
        <div className="flex border-b bg-muted/40 text-[10px] text-muted-foreground">
          <div className="w-[260px] shrink-0 border-r px-4 py-2 font-semibold uppercase tracking-wide">Task</div>
          <div className="relative flex">
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = addDays(start, i)
              return (
                <div key={i} className="shrink-0 border-r py-2 text-center" style={{ width: DAY_W }}>
                  {format(day, "d")}
                  {day.getDate() === 1 || i === 0 ? (
                    <div className="font-semibold text-foreground">{format(day, "MMM")}</div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {/* Today marker */}
          {today >= 0 && today < totalDays && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-400"
              style={{ left: 260 + today * DAY_W + DAY_W / 2 }}
            />
          )}
          {dated.map((t) => {
            const s = Math.max(differenceInCalendarDays(new Date(t.createdAt), start), 0)
            const e = differenceInCalendarDays(new Date(t.dueDate!), start)
            const left = s * DAY_W
            const width = Math.max((e - s + 1) * DAY_W, DAY_W)
            return (
              <div key={t.id} className="flex items-center border-b last:border-0 hover:bg-muted/30">
                <button
                  onClick={() => openTask(t.id)}
                  className="flex w-[260px] shrink-0 items-center gap-2 border-r px-4 py-2 text-left"
                >
                  <span className="font-mono text-[10px] font-bold text-primary">{t.key}</span>
                  <span className="truncate text-xs font-medium">{t.title}</span>
                </button>
                <div className="relative h-9 flex-1">
                  <button
                    onClick={() => openTask(t.id)}
                    className="absolute top-1.5 flex h-6 items-center gap-1 rounded px-2 text-[10px] font-semibold text-white shadow-sm"
                    style={{ left, width, backgroundColor: t.epic?.color ?? "#2563eb" }}
                    title={`${t.key}: ${t.title}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full bg-white/80`} />
                    <span className="truncate">{STATUS_META[t.status].label}</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
