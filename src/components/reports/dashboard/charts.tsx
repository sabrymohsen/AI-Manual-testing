"use client"

import { memo, useMemo, useState } from "react"
import {
  ComposedChart,
  BarChart,
  AreaChart,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts"
import { CHART_COLORS, PALETTE } from "@/lib/reports/colors"
import { Skeleton } from "@/components/ui/skeleton"
import { LineChart as LineIcon, Radar as RadarIcon, Inbox } from "@/components/ui/icons"
import { format } from "date-fns"
import type {
  BurndownResult,
  VelocityResult,
  CumulativeFlowPoint,
  DefectTrendPoint,
  ExecutionFunnelResult,
  TeamMemberPerf,
  TaskCreatedResolvedPoint,
  ControlChartPoint,
} from "@/lib/reports/analytics"

// ── Shared card shell ──

function ChartCard({
  id,
  title,
  subtitle,
  action,
  loading,
  empty,
  emptyText,
  ariaLabel,
  children,
}: {
  id?: string
  title: string
  subtitle?: string
  action?: React.ReactNode
  loading?: boolean
  empty?: boolean
  emptyText?: string
  ariaLabel?: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="hover-lift flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm" role="figure" aria-label={ariaLabel || title}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="title-3 flex items-center gap-2 text-foreground">
            <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />
            {title}
          </h3>
          {subtitle && <p className="caption-5 text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="h-64 w-full">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Inbox className="h-5 w-5" aria-hidden />
            </span>
            <span className="body-6 max-w-xs text-muted-foreground">{emptyText || "No data for this period yet."}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", borderRadius: 12, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
  labelStyle: { fontWeight: 600, color: "#0f172a" },
}
const axis = { tick: { fontSize: 11, fill: CHART_COLORS.neutral }, stroke: CHART_COLORS.border }

// ── A. Burndown ──

export const BurndownChart = memo(function BurndownChart({ data, loading }: { data?: BurndownResult; loading: boolean }) {
  const empty = !data || !data.sprint || data.points.length === 0
  return (
    <ChartCard
      id="chart-burndown"
      title="Sprint Burndown"
      subtitle={data?.sprint ? `${data.sprint.name} · ${data.totalPoints} pts committed` : "Ideal vs actual remaining"}
      loading={loading}
      empty={empty}
      emptyText="No active sprint selected"
      ariaLabel="Sprint burndown chart: ideal versus actual remaining story points"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data?.points} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line name="Ideal" type="monotone" dataKey="ideal" stroke={CHART_COLORS.neutral} strokeDasharray="5 5" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Actual" type="monotone" dataKey="actual" stroke={CHART_COLORS.primary} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})

// ── B. Velocity ──

export const VelocityChart = memo(function VelocityChart({ data, loading }: { data?: VelocityResult; loading: boolean }) {
  const empty = !data || data.sprints.length === 0
  return (
    <ChartCard
      id="chart-velocity"
      title="Velocity"
      subtitle={data ? `Avg ${data.averageVelocity} pts / sprint` : "Committed vs completed"}
      loading={loading}
      empty={empty}
      emptyText="No sprints yet"
      ariaLabel="Velocity chart: committed versus completed story points per sprint"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data?.sprints} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
          <XAxis dataKey="name" {...axis} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar name="Committed" dataKey="committed" fill="hsl(var(--muted-foreground) / 0.35)" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={800} />
          <Bar name="Completed" dataKey="completed" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={800} />
          {/* No capacity line: the API sets capacity to the committed points, so it only repeated the grey bar. */}
          {data && data.averageVelocity > 0 && (
            <ReferenceLine y={data.averageVelocity} stroke={CHART_COLORS.success} strokeDasharray="6 3" label={{ value: "avg", fontSize: 10, fill: CHART_COLORS.success, position: "right" }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})

// ── C. Cumulative Flow ──

export const CumulativeFlowChart = memo(function CumulativeFlowChart({ data, loading }: { data?: CumulativeFlowPoint[]; loading: boolean }) {
  const rows = useMemo(() => (data || []).map((d) => ({ ...d, label: format(new Date(d.date), "MMM d") })), [data])
  const empty = rows.length === 0 || rows.every((r) => r.backlog + r.todo + r.inProgress + r.done === 0)
  return (
    <ChartCard
      id="chart-cfd"
      title="Cumulative Flow"
      subtitle="Work distribution by status over time"
      loading={loading}
      empty={empty}
      ariaLabel="Cumulative flow diagram showing task counts by status over time"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area name="Done" stackId="1" dataKey="done" stroke={CHART_COLORS.success} fill={CHART_COLORS.success} fillOpacity={0.75} isAnimationActive={false} />
          <Area name="In Progress" stackId="1" dataKey="inProgress" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.6} isAnimationActive={false} />
          <Area name="To Do" stackId="1" dataKey="todo" stroke={CHART_COLORS.neutral} fill={CHART_COLORS.neutral} fillOpacity={0.5} isAnimationActive={false} />
          <Area name="Backlog" stackId="1" dataKey="backlog" stroke="hsl(var(--muted-foreground) / 0.35)" fill="hsl(var(--muted-foreground) / 0.35)" fillOpacity={0.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})

// ── D. Defect Trend ──

export const DefectTrendChart = memo(function DefectTrendChart({ data, loading }: { data?: DefectTrendPoint[]; loading: boolean }) {
  const rows = useMemo(() => (data || []).map((d) => ({ ...d, label: format(new Date(d.date), "MMM d") })), [data])
  const empty = rows.length === 0 || rows.every((r) => r.created + r.resolved + r.cumulativeOpen === 0)
  return (
    <ChartCard
      id="chart-defect-trend"
      title="Defect Trend"
      subtitle="Created vs resolved · cumulative open"
      loading={loading}
      empty={empty}
      ariaLabel="Defect trend chart: bugs created versus resolved with cumulative open area"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis yAxisId="left" {...axis} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" {...axis} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area yAxisId="right" name="Open (cum.)" type="monotone" dataKey="cumulativeOpen" stroke={CHART_COLORS.danger} fill={CHART_COLORS.danger} fillOpacity={0.1} isAnimationActive={false} />
          <Line yAxisId="left" name="Created" type="monotone" dataKey="created" stroke={CHART_COLORS.danger} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="left" name="Resolved" type="monotone" dataKey="resolved" stroke={CHART_COLORS.success} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})

// ── E. Team Performance (radar / bar toggle) ──

const RADAR_DIMS: { key: keyof TeamMemberPerf; label: string; invert?: boolean }[] = [
  { key: "storyPoints", label: "Story Pts" },
  { key: "tasksCompleted", label: "Tasks" },
  { key: "bugsFound", label: "Quality", invert: true },
  { key: "passRate", label: "Pass %" },
  { key: "turnaroundHours", label: "Turnaround", invert: true },
  { key: "testsWritten", label: "Tests" },
]

export const TeamPerformanceChart = memo(function TeamPerformanceChart({ data, loading }: { data?: TeamMemberPerf[]; loading: boolean }) {
  const [mode, setMode] = useState<"radar" | "bar">("radar")
  const members = data ?? []
  const empty = members.length === 0

  // Normalize each dimension to 0..100 across members (inverted dims reward lower values).
  const radarData = useMemo(() => {
    return RADAR_DIMS.map((dim) => {
      const max = Math.max(1, ...members.map((m) => Number(m[dim.key]) || 0))
      const row: Record<string, any> = { dimension: dim.label }
      for (const m of members) {
        const raw = Number(m[dim.key]) || 0
        row[m.name] = Math.round(dim.invert ? (1 - raw / max) * 100 : (raw / max) * 100)
      }
      return row
    })
  }, [members])

  const toggle = (
    <div className="flex overflow-hidden rounded-lg border border-border text-xs">
      <button onClick={() => setMode("radar")} className={`flex items-center gap-1 px-2 py-1 ${mode === "radar" ? "bg-primary text-white" : "text-muted-foreground"}`}>
        <RadarIcon className="h-3 w-3" /> Radar
      </button>
      <button onClick={() => setMode("bar")} className={`flex items-center gap-1 px-2 py-1 ${mode === "bar" ? "bg-primary text-white" : "text-muted-foreground"}`}>
        <LineIcon className="h-3 w-3" /> Bar
      </button>
    </div>
  )

  return (
    <ChartCard
      id="chart-team"
      title="Team Performance"
      subtitle={`${members.length} member${members.length === 1 ? "" : "s"}`}
      action={toggle}
      loading={loading}
      empty={empty}
      emptyText="No assigned work in range"
      ariaLabel="Team performance chart across six delivery dimensions"
    >
      <ResponsiveContainer width="100%" height="100%">
        {mode === "radar" ? (
          <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke={CHART_COLORS.border} />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: CHART_COLORS.neutral }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip {...tooltipStyle} />
            {members.map((m, i) => (
              <Radar key={m.name} name={m.name} dataKey={m.name} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.12} isAnimationActive={false} />
            ))}
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </RadarChart>
        ) : (
          <BarChart data={members} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar name="Story Pts" dataKey="storyPoints" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Bar name="Tasks" dataKey="tasksCompleted" fill={CHART_COLORS.info} radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Bar name="Tests" dataKey="testsWritten" fill={CHART_COLORS.success} radius={[3, 3, 0, 0]} maxBarSize={22} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  )
})

// ── F. Execution Funnel (CSS) ──

export const ExecutionFunnelChart = memo(function ExecutionFunnelChart({ data, loading }: { data?: ExecutionFunnelResult; loading: boolean }) {
  // Nothing ran: four "0 / 0%" bars say nothing, so explain instead.
  const empty = !data || data.total === 0 || data.executed === 0
  const stages = useMemo(() => {
    if (!data) return []
    const t = data.total || 1
    return [
      { label: "Total Cases", count: data.total, color: CHART_COLORS.primary, prev: data.total },
      { label: "Executed", count: data.executed, color: CHART_COLORS.info, prev: data.total },
      { label: "Passed", count: data.passed, color: CHART_COLORS.success, prev: data.executed },
      { label: "Failed", count: data.failed, color: CHART_COLORS.danger, prev: data.executed },
      { label: "Blocked", count: data.blocked, color: CHART_COLORS.warning, prev: data.executed },
    ].map((s) => ({
      ...s,
      pctOfTotal: Math.round((s.count / t) * 100),
      conversion: s.prev ? Math.round((s.count / s.prev) * 100) : 0,
      // Visual width: min 12% so small stages stay legible.
      width: Math.max(12, Math.round((s.count / t) * 100)),
    }))
  }, [data])

  return (
    <ChartCard
      id="chart-funnel"
      title="Test Execution Funnel"
      subtitle="Total → executed → outcomes"
      loading={loading}
      empty={empty}
      emptyText={data && data.total > 0 ? `None of the ${data.total} test cases ran in this period. Run them from Test Cases or the Automation Hub.` : "No test cases in this project yet."}
      ariaLabel="Test execution funnel from total cases through to passed, failed, and blocked"
    >
      <div className="flex h-full flex-col justify-center gap-2">
        {stages.map((s, i) => (
          <div
            key={s.label}
            className="group relative mx-auto flex items-center justify-between rounded-lg px-3 py-2 text-white shadow-sm transition-all duration-300"
            style={{ width: `${s.width}%`, backgroundColor: s.color, animationDelay: `${i * 60}ms` }}
            title={`${s.label}: ${s.count} (${s.pctOfTotal}% of total, ${s.conversion}% of previous)`}
          >
            <span className="truncate text-xs font-semibold">{s.label}</span>
            <span className="ml-2 shrink-0 text-xs font-semibold tabular-nums">
              {s.count}
              <span className="ml-1 font-normal opacity-80">{s.pctOfTotal}%</span>
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
})

// ── G. Created vs Resolved (task-level) ──

export const CreatedResolvedChart = memo(function CreatedResolvedChart({ data, loading }: { data?: TaskCreatedResolvedPoint[]; loading: boolean }) {
  const rows = useMemo(() => (data || []).map((d) => ({ ...d, label: format(new Date(d.date), "MMM d") })), [data])
  // A flat "still open" band with nothing created or resolved is not a trend.
  const empty = rows.length === 0 || rows.every((r) => r.created + r.resolved === 0)
  return (
    <ChartCard
      id="chart-task-created-resolved"
      title="Created vs Resolved"
      subtitle="Tasks created and completed over time"
      loading={loading}
      empty={empty}
      emptyText="No issues were created or resolved in this period."
      ariaLabel="Task created versus resolved trend chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis yAxisId="left" {...axis} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" {...axis} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" name="Created" dataKey="created" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar yAxisId="left" name="Resolved" dataKey="resolved" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Area yAxisId="right" name="Open (cum.)" type="monotone" dataKey="cumulativeOpen" stroke={CHART_COLORS.danger} fill={CHART_COLORS.danger} fillOpacity={0.1} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})

// ── H. Control Chart (cycle time scatter) ──

export const ControlChart = memo(function ControlChart({ data, loading }: { data?: ControlChartPoint[]; loading: boolean }) {
  const rows = useMemo(() => data || [], [data])
  const empty = rows.length === 0

  const avgCycleTime = useMemo(() => {
    if (rows.length === 0) return 0
    return Math.round((rows.reduce((a, r) => a + r.cycleTimeDays, 0) / rows.length) * 10) / 10
  }, [rows])

  return (
    <ChartCard
      id="chart-control"
      title="Control Chart"
      subtitle={rows.length > 0 ? `Avg cycle time ${avgCycleTime} days · ${rows.length} completed tasks` : "Cycle time for completed tasks"}
      loading={loading}
      empty={empty}
      emptyText="No completed tasks in range"
      ariaLabel="Control chart showing cycle time scatter for completed tasks"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} />
          <XAxis
            type="number"
            dataKey="cycleTimeDays"
            name="Cycle Time (days)"
            {...axis}
            label={{ value: "Days", position: "insideBottom", offset: -2, fontSize: 10, fill: CHART_COLORS.neutral }}
          />
          <YAxis
            type="number"
            dataKey="storyPoints"
            name="Story Points"
            {...axis}
            allowDecimals={false}
            label={{ value: "Story Points", angle: -90, position: "insideLeft", fontSize: 10, fill: CHART_COLORS.neutral }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", borderRadius: 12, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            labelStyle={{ fontWeight: 600, color: "#0f172a" }}
            formatter={(value: any, name: string, props: any) => {
              if (name === "Story Points") return [value ?? "—", "Story Points"]
              return [value, name]
            }}
            labelFormatter={(_: any, p: any) => {
              const pt = p?.payload
              return pt ? `${pt.taskKey}: ${pt.title}` : ""
            }}
          />
          {avgCycleTime > 0 && (
            <ReferenceLine x={avgCycleTime} stroke={CHART_COLORS.warning} strokeDasharray="6 3" label={{ value: `avg ${avgCycleTime}d`, fontSize: 10, fill: CHART_COLORS.warning, position: "top" }} />
          )}
          <Scatter name="Completed Tasks" data={rows} fill={CHART_COLORS.primary}>
            {rows.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  )
})
