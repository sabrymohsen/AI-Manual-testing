"use client"

import { useMemo, useState } from "react"
import { Story, Sprint, points } from "./shared"

/**
 * Sprint reports: burndown (ideal vs actual remaining points) for a selected
 * sprint, and velocity (completed points per completed sprint). Both derived
 * from real data — "completed" points come from stories in status Covered, and
 * the burndown's actual curve uses each Covered story's updatedAt as its
 * completion date (an approximation, since we don't snapshot daily).
 */
export default function SprintReports({ stories, sprints }: { stories: Story[]; sprints: Sprint[] }) {
  const defaultSel = sprints.find((s) => s.status === "Active")?.id || sprints[0]?.id || ""
  const [sel, setSel] = useState(defaultSel)

  if (sprints.length === 0) {
    return <div className="border rounded-xl bg-card py-16 text-center text-sm text-muted-foreground font-medium">Create sprints to see burndown &amp; velocity reports.</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-xl bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-200">Burndown</h3>
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="h-7 text-[11px] font-bold rounded-md border bg-background px-1.5">
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Burndown sprint={sprints.find((s) => s.id === sel) || null} stories={stories} />
        </div>
        <div className="border rounded-xl bg-card p-4">
          <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 mb-3">Velocity <span className="text-[10px] font-semibold text-muted-foreground">· completed points per sprint</span></h3>
          <Velocity sprints={sprints} stories={stories} />
        </div>
      </div>
    </div>
  )
}

// ── Burndown: 2-series line (ideal + actual) → legend present. ──
function Burndown({ sprint, stories }: { sprint: Sprint | null; stories: Story[] }) {
  const model = useMemo(() => {
    if (!sprint) return null
    const scope = stories.filter((s) => s.sprintId === sprint.id && s.status !== "Deprecated")
    const total = points(scope)
    if (total === 0) return { empty: true } as const

    const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
    const start = sprint.startDate ? new Date(sprint.startDate) : sprint.endDate ? addDays(new Date(sprint.endDate), -14) : addDays(new Date(), -7)
    const end = sprint.endDate ? new Date(sprint.endDate) : addDays(start, 14)
    const dayMs = 86400000
    const nDays = Math.min(30, Math.max(2, Math.round((end.getTime() - start.getTime()) / dayMs) + 1))
    const now = Date.now()

    const days = Array.from({ length: nDays }, (_, i) => addDays(start, i))
    const ideal = days.map((_, i) => total * (1 - i / (nDays - 1)))
    const actual = days.map((day, i) => {
      const endOfDay = day.getTime() + dayMs - 1
      if (day.getTime() > now) return null // no future actuals
      const burned = scope
        .filter((s) => s.status === "Covered" && s.updatedAt && new Date(s.updatedAt).getTime() <= endOfDay)
        .reduce((n, s) => n + (s.storyPoints || 0), 0)
      return total - burned
    })
    return { total, nDays, ideal, actual, days }
  }, [sprint, stories])

  if (!model) return <ChartEmpty text="Select a sprint." />
  if ("empty" in model) return <ChartEmpty text="No estimated stories in this sprint yet." />

  const W = 600, H = 220, padL = 34, padB = 22, padT = 8, padR = 8
  const plotW = W - padL - padR, plotH = H - padT - padB
  const x = (i: number) => padL + (i / (model.nDays - 1)) * plotW
  const y = (v: number) => padT + (1 - v / model.total) * plotH
  const idealPath = model.ideal.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const actualPts = model.actual.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ")

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sprint burndown chart">
        {/* y grid + labels */}
        {[0, 0.5, 1].map((f) => {
          const yy = padT + f * plotH
          return (
            <g key={f}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth={1} />
              <text x={padL - 4} y={yy + 3} textAnchor="end" className="fill-slate-400 text-[9px]">{Math.round(model.total * (1 - f))}</text>
            </g>
          )
        })}
        {/* ideal (dashed, neutral) */}
        <path d={idealPath} fill="none" stroke="currentColor" className="text-slate-400" strokeWidth={1.5} strokeDasharray="4 3" />
        {/* actual (solid, indigo) */}
        {actualPts && <polyline points={actualPts} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {/* x labels: start / end */}
        <text x={padL} y={H - 6} className="fill-slate-400 text-[9px]">{model.days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-slate-400 text-[9px]">{model.days[model.nDays - 1].toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>
      </svg>
      <div className="flex items-center gap-4 mt-1 text-[10px] font-bold">
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" /> Ideal</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#6366f1" }} /> Actual (remaining)</span>
      </div>
    </div>
  )
}

// ── Velocity: single-series bars → no legend, title names it. ──
function Velocity({ sprints, stories }: { sprints: Sprint[]; stories: Story[] }) {
  const data = sprints
    .filter((s) => s.status === "Completed")
    .map((s) => ({ name: s.name, pts: points(stories.filter((st) => st.sprintId === s.id && st.status === "Covered")) }))

  if (data.length === 0) return <ChartEmpty text="No completed sprints yet — velocity appears after you complete a sprint." />

  const max = Math.max(1, ...data.map((d) => d.pts))
  const W = 600, H = 220, padB = 26, padT = 16, padL = 8, padR = 8
  const plotH = H - padT - padB
  const bw = (W - padL - padR) / data.length
  const barW = Math.min(60, bw * 0.6)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sprint velocity chart">
      {data.map((d, i) => {
        const h = (d.pts / max) * plotH
        const cx = padL + i * bw + bw / 2
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={padT + plotH - h} width={barW} height={h} rx={4} fill="#6366f1" />
            <text x={cx} y={padT + plotH - h - 4} textAnchor="middle" className="fill-slate-600 dark:fill-slate-300 text-[10px] font-black">{d.pts}</text>
            <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[9px]">{d.name.length > 12 ? d.name.slice(0, 11) + "…" : d.name}</text>
          </g>
        )
      })}
    </svg>
  )
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="h-[220px] flex items-center justify-center text-[11px] text-muted-foreground font-medium text-center px-4">{text}</div>
}
