"use client"

/**
 * Timeline: issues as bars from start to due date, grouped by epic, over the
 * sprints they belong to. Drag a bar to move it, drag an edge to change its
 * start or due date.
 *
 * A bar's start is the issue's start date, else its sprint's start, else when
 * it was created; its end is the due date, else the sprint's end. Bars that
 * borrow a sprint's dates are drawn lighter, so planned dates stand out.
 */
import { useMemo, useRef, useState } from "react"
import type { TaskFilters, ScrumTask } from "@/types/scrum"
import { useScrumSprints, useScrumTasks, useUpdateTask, setBoardDragging } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { STATUS_META } from "@/components/scrum/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns"

const LABEL_W = 280
const ZOOMS = { week: 40, month: 20, quarter: 8 } as const
type Zoom = keyof typeof ZOOMS

interface Bar {
  task: ScrumTask
  start: Date
  end: Date
  planned: boolean // both ends come from the issue's own dates
}

type DragState = { taskId: string; mode: "move" | "start" | "end"; originX: number; deltaDays: number } | null

export function TimelineView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const { data: tasks, isLoading } = useScrumTasks(projectId, filters)
  const { data: sprints } = useScrumSprints(projectId)
  const update = useUpdateTask(projectId)
  const { openTask } = useScrumUI()
  const [zoom, setZoom] = useState<Zoom>("month")
  const [byEpic, setByEpic] = useState(true)
  const [drag, setDrag] = useState<DragState>(null)
  const moved = useRef(false)
  const DAY_W = ZOOMS[zoom]

  const model = useMemo(() => {
    const sprintById = new Map((sprints ?? []).map((s) => [s.id, s]))
    const bars: Bar[] = []
    let unscheduled = 0
    for (const t of (tasks ?? []) as ScrumTask[]) {
      if (t.type === "SUBTASK") continue
      const sp = t.sprintId ? sprintById.get(t.sprintId) : undefined
      const endRaw = t.dueDate ?? sp?.endDate ?? null
      if (!endRaw) {
        unscheduled++
        continue
      }
      const startRaw = t.startDate ?? sp?.startDate ?? t.createdAt
      let start = startOfDay(new Date(startRaw))
      const end = startOfDay(new Date(endRaw))
      if (start > end) start = end
      bars.push({ task: t, start, end, planned: !!t.startDate && !!t.dueDate })
    }
    if (!bars.length) return { bars, unscheduled, start: new Date(), totalDays: 0, sprintBands: [] as { name: string; from: number; to: number; active: boolean }[] }

    const sprintDates = (sprints ?? []).filter((s) => s.startDate && s.endDate)
    const min = Math.min(...bars.map((b) => b.start.getTime()), ...sprintDates.map((s) => new Date(s.startDate!).getTime()))
    const max = Math.max(...bars.map((b) => b.end.getTime()), ...sprintDates.map((s) => new Date(s.endDate!).getTime()), Date.now())
    const start = addDays(startOfDay(new Date(min)), -2)
    const totalDays = Math.min(Math.max(differenceInCalendarDays(new Date(max), start) + 4, 14), 400)
    const sprintBands = sprintDates
      .map((s) => ({
        name: s.name,
        from: differenceInCalendarDays(new Date(s.startDate!), start),
        to: differenceInCalendarDays(new Date(s.endDate!), start),
        active: s.status === "ACTIVE",
      }))
      .filter((b) => b.to >= 0 && b.from < totalDays)
    return { bars, unscheduled, start, totalDays, sprintBands }
  }, [tasks, sprints])

  const groups = useMemo(() => {
    if (!byEpic) return [{ key: "all", title: null as string | null, color: null as string | null, bars: model.bars }]
    const map = new Map<string, { key: string; title: string | null; color: string | null; bars: Bar[] }>()
    for (const b of model.bars) {
      const k = b.task.epic?.id ?? "none"
      if (!map.has(k)) map.set(k, { key: k, title: b.task.epic?.title ?? "No epic", color: b.task.epic?.color ?? null, bars: [] })
      map.get(k)!.bars.push(b)
    }
    return [...map.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : (a.title || "").localeCompare(b.title || "")))
  }, [model.bars, byEpic])

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />

  const { start, totalDays, sprintBands, unscheduled } = model
  const today = differenceInCalendarDays(new Date(), start)

  const onPointerDown = (e: React.PointerEvent, taskId: string, mode: "move" | "start" | "end") => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    moved.current = false
    setBoardDragging(true)
    setDrag({ taskId, mode, originX: e.clientX, deltaDays: 0 })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.originX) / DAY_W)
    if (deltaDays !== drag.deltaDays) {
      moved.current = true
      setDrag({ ...drag, deltaDays })
    }
  }
  const onPointerUp = (bar: Bar) => {
    if (!drag) return
    const { mode, deltaDays } = drag
    setDrag(null)
    setBoardDragging(false)
    if (!moved.current || deltaDays === 0) {
      if (!moved.current) openTask(bar.task.id)
      return
    }
    let s = bar.start
    let en = bar.end
    if (mode === "move") {
      s = addDays(s, deltaDays)
      en = addDays(en, deltaDays)
    } else if (mode === "start") {
      s = addDays(s, deltaDays)
      if (s > en) s = en
    } else {
      en = addDays(en, deltaDays)
      if (en < s) en = s
    }
    // Saved at noon UTC so the calendar day survives any time zone.
    const iso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)).toISOString()
    update.mutate({ taskId: bar.task.id, body: { startDate: iso(s), dueDate: iso(en) } })
  }

  const preview = (bar: Bar) => {
    if (!drag || drag.taskId !== bar.task.id) return { s: bar.start, e: bar.end }
    const d = drag.deltaDays
    if (drag.mode === "move") return { s: addDays(bar.start, d), e: addDays(bar.end, d) }
    if (drag.mode === "start") return { s: addDays(bar.start, d) > bar.end ? bar.end : addDays(bar.start, d), e: bar.end }
    return { s: bar.start, e: addDays(bar.end, d) < bar.start ? bar.start : addDays(bar.end, d) }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
            <button key={z} onClick={() => setZoom(z)} className={`rounded px-2.5 py-1 capitalize ${zoom === z ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {z}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={byEpic} onChange={(e) => setByEpic(e.target.checked)} /> Group by epic
        </label>
        <span className="text-muted-foreground">Drag a bar to move it · drag its edges to change start or due date</span>
        {unscheduled > 0 && <span className="ml-auto text-muted-foreground">{unscheduled} issue{unscheduled === 1 ? "" : "s"} without dates or a dated sprint aren&apos;t shown</span>}
      </div>

      {totalDays === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          Nothing to plot yet. Give issues a due date, or put them in a sprint that has dates.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card" onPointerMove={onPointerMove}>
          <div style={{ width: LABEL_W + totalDays * DAY_W }} className="relative select-none">
            {/* Header: sprints, then days */}
            <div className="sticky top-0 z-20 border-b bg-muted/60 backdrop-blur">
              <div className="relative flex h-6 border-b">
                <div className="shrink-0 border-r px-4 text-[10px] font-semibold uppercase leading-6 tracking-wide text-muted-foreground" style={{ width: LABEL_W }}>
                  Sprints
                </div>
                <div className="relative flex-1">
                  {sprintBands.map((b) => (
                    <div
                      key={b.name + b.from}
                      className={`absolute top-0.5 h-5 truncate rounded px-1.5 text-[10px] font-semibold leading-5 ${b.active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
                      style={{ left: Math.max(b.from, 0) * DAY_W, width: (Math.min(b.to, totalDays - 1) - Math.max(b.from, 0) + 1) * DAY_W }}
                      title={b.name}
                    >
                      {b.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex text-[10px] text-muted-foreground">
                <div className="shrink-0 border-r px-4 py-1.5 font-semibold uppercase tracking-wide" style={{ width: LABEL_W }}>Issue</div>
                <div className="flex">
                  {Array.from({ length: totalDays }).map((_, i) => {
                    const day = addDays(start, i)
                    const showDay = zoom === "week" || (zoom === "month" ? day.getDay() === 1 : day.getDate() === 1)
                    return (
                      <div key={i} className={`shrink-0 border-r py-1.5 text-center ${day.getDay() === 0 || day.getDay() === 6 ? "bg-muted/60" : ""}`} style={{ width: DAY_W }}>
                        {(day.getDate() === 1 || i === 0) && <div className="whitespace-nowrap font-semibold text-foreground">{format(day, "MMM")}</div>}
                        {showDay && <span className="whitespace-nowrap">{format(day, "d")}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Rows */}
            <div className="relative">
              {/* Sprint shading + today line */}
              {sprintBands.map((b) => (
                <div
                  key={`shade-${b.name}-${b.from}`}
                  className={`pointer-events-none absolute top-0 bottom-0 ${b.active ? "bg-primary/[0.05]" : "bg-muted/30"}`}
                  style={{ left: LABEL_W + Math.max(b.from, 0) * DAY_W, width: (Math.min(b.to, totalDays - 1) - Math.max(b.from, 0) + 1) * DAY_W }}
                />
              ))}
              {today >= 0 && today < totalDays && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-400" style={{ left: LABEL_W + today * DAY_W + DAY_W / 2 }} title="Today" />
              )}

              {groups.map((g) => (
                <div key={g.key}>
                  {g.title && (
                    <div className="relative flex items-center gap-2 border-b bg-muted/40 px-4 py-1.5 text-xs font-semibold" style={{ width: LABEL_W }}>
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color ?? "#94a3b8" }} />
                      {g.title}
                      <span className="font-normal text-muted-foreground">{g.bars.length}</span>
                    </div>
                  )}
                  {g.bars.map((bar) => {
                    const t = bar.task
                    const { s, e } = preview(bar)
                    const left = differenceInCalendarDays(s, start) * DAY_W
                    const width = Math.max((differenceInCalendarDays(e, s) + 1) * DAY_W, DAY_W)
                    const color = t.epic?.color ?? "#6366f1"
                    const active = drag?.taskId === t.id
                    return (
                      <div key={t.id} className="relative flex items-center border-b last:border-0 hover:bg-muted/20">
                        <button onClick={() => openTask(t.id)} className="flex shrink-0 items-center gap-2 border-r bg-card px-4 py-2 text-left" style={{ width: LABEL_W }}>
                          <span className="font-mono text-[10px] font-bold text-primary">{t.key}</span>
                          <span className="truncate text-xs font-medium">{t.title}</span>
                        </button>
                        <div className="relative h-9 flex-1">
                          <div
                            onPointerDown={(ev) => onPointerDown(ev, t.id, "move")}
                            onPointerUp={() => onPointerUp(bar)}
                            className={`group absolute top-1.5 flex h-6 cursor-grab items-center gap-1 overflow-hidden rounded px-2 text-[10px] font-semibold text-white shadow-sm ${active ? "cursor-grabbing ring-2 ring-primary/40" : ""}`}
                            style={{ left, width, backgroundColor: color, opacity: bar.planned ? 1 : 0.6 }}
                            title={`${t.key}: ${t.title}\n${format(s, "MMM d")} → ${format(e, "MMM d")}${bar.planned ? "" : " (from its sprint)"}`}
                          >
                            <span
                              onPointerDown={(ev) => onPointerDown(ev, t.id, "start")}
                              onPointerUp={() => onPointerUp(bar)}
                              className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-black/0 hover:bg-black/20"
                              aria-label="Change start date"
                            />
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[t.status].dot} ring-1 ring-white`} />
                            <span className="truncate">{width > 60 ? STATUS_META[t.status].label : ""}</span>
                            <span
                              onPointerDown={(ev) => onPointerDown(ev, t.id, "end")}
                              onPointerUp={() => onPointerUp(bar)}
                              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/0 hover:bg-black/20"
                              aria-label="Change due date"
                            />
                          </div>
                          {active && (
                            <span className="absolute -top-0.5 z-20 rounded bg-foreground px-1.5 text-[10px] text-background" style={{ left }}>
                              {format(s, "MMM d")} → {format(e, "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
