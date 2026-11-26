"use client"

/**
 * QA Analytics Dashboard — a full-screen analytics workspace over real Postgres
 * data. KPI cards + six interactive charts + tabbed, paginated data tables. All
 * series come from /api/reports/* (see src/lib/reports/analytics.ts). The
 * existing role-based report exporters are reused for PDF/Word/Excel.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle, FileText, Bug, ShieldCheck, Zap, Timer } from "@/components/ui/icons"
import {
  useProjects,
  useProjectReport,
  useSprints,
  useVelocity,
  useBurndown,
  useCumulativeFlow,
  useDefectTrend,
  useExecutionFunnel,
  useTeamPerformance,
  useTaskCreatedResolved,
  useControlChart,
  type DashboardFilters,
} from "@/hooks/reports/use-analytics"
import { DashboardHeader, useNow, type DashboardRole, type DatePreset } from "@/components/reports/dashboard/header"
import { KPICards, type KPICardData } from "@/components/reports/dashboard/kpi-cards"
import {
  BurndownChart,
  VelocityChart,
  CumulativeFlowChart,
  DefectTrendChart,
  TeamPerformanceChart,
  ExecutionFunnelChart,
  CreatedResolvedChart,
  ControlChart,
} from "@/components/reports/dashboard/charts"
import { TabbedTables } from "@/components/reports/dashboard/tables"
import { ExportMenu } from "@/components/reports/dashboard/export-menu"
import { Insights, buildInsights } from "@/components/reports/dashboard/insights"

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}
function presetRange(p: DatePreset): { from: string; to: string } {
  const to = isoDaysAgo(0)
  if (p === "7D") return { from: isoDaysAgo(7), to }
  if (p === "30D") return { from: isoDaysAgo(30), to }
  if (p === "90D") return { from: isoDaysAgo(90), to }
  if (p === "YTD") return { from: `${new Date().getFullYear()}-01-01`, to }
  return { from: isoDaysAgo(30), to }
}

// Which charts each role sees (spec §8). Order matters.
type ChartKey = "burndown" | "velocity" | "cfd" | "defectTrend" | "team" | "funnel" | "taskCreatedResolved" | "controlChart"
const ROLE_CHARTS: Record<DashboardRole, ChartKey[]> = {
  PM: ["burndown", "velocity", "defectTrend", "cfd", "funnel", "taskCreatedResolved"], // hides team, controlChart
  "QA Manager": ["burndown", "cfd", "defectTrend", "team", "funnel", "controlChart"], // hides velocity, taskCreatedResolved
  "Test Lead": ["burndown", "velocity", "defectTrend", "team", "funnel", "taskCreatedResolved", "controlChart"], // hides cfd
  Developer: ["defectTrend", "burndown", "velocity", "cfd", "team", "controlChart"], // hides funnel, taskCreatedResolved
}

export default function ReportsPage() {
  const qc = useQueryClient()
  const { data: projects = [] } = useProjects()

  const [projectId, setProjectId] = useState("")
  const [sprintId, setSprintId] = useState<string | undefined>(undefined)
  const [preset, setPreset] = useState<DatePreset>("30D")
  const [custom, setCustom] = useState(presetRange("30D"))
  const [role, setRole] = useState<DashboardRole>("PM")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  useNow() // keep "updated X ago" fresh

  // Default to whichever project is selected app-wide, falling back to the
  // first one. This previously always defaulted to projects[0], so the page
  // showed a different project's analytics from the one chosen in the sidebar —
  // and silently, since the header picker just displayed that other project.
  //
  // `projectChanged` is the event ProjectSelectionGateway fires when the scope
  // is switched; without listening for it the reports page would keep showing
  // the old project until a full reload.
  useEffect(() => {
    if (projectId || projects.length === 0) return

    const stored = typeof window !== "undefined" ? localStorage.getItem("activeProjectId") : null
    // Only honour it if it's a project this user can actually see.
    const valid = stored && projects.some((p: { id: string }) => p.id === stored)
    setProjectId(valid ? stored! : projects[0].id)
  }, [projects, projectId])

  useEffect(() => {
    const onProjectChanged = () => {
      const next = localStorage.getItem("activeProjectId")
      if (next) {
        setProjectId(next)
        setSprintId(undefined) // sprints belong to the old project
      }
    }
    window.addEventListener("projectChanged", onProjectChanged)
    return () => window.removeEventListener("projectChanged", onProjectChanged)
  }, [])

  const range = preset === "Custom" ? custom : presetRange(preset)
  const filters: DashboardFilters = { projectId, sprintId, from: range.from, to: range.to }

  // ── Data ──
  const report = useProjectReport(filters)
  const sprints = useSprints(projectId)
  const velocity = useVelocity(filters)
  const burndown = useBurndown(filters)
  const cfd = useCumulativeFlow(filters)
  const defect = useDefectTrend(filters)
  const funnel = useExecutionFunnel(filters)
  const team = useTeamPerformance(filters)
  const taskCreatedResolved = useTaskCreatedResolved(filters)
  const controlChart = useControlChart(filters)

  const anyFetching =
    report.isFetching ||
    velocity.isFetching ||
    burndown.isFetching ||
    cfd.isFetching ||
    defect.isFetching ||
    funnel.isFetching ||
    team.isFetching ||
    taskCreatedResolved.isFetching ||
    controlChart.isFetching

  // Track last successful update.
  useEffect(() => {
    if (report.dataUpdatedAt) setLastUpdated(new Date(report.dataUpdatedAt))
  }, [report.dataUpdatedAt])

  // Central auto-refresh (60s) so the header toggle governs it.
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => qc.invalidateQueries({ queryKey: ["reports"] }), 60_000)
    return () => clearInterval(t)
  }, [autoRefresh, qc])

  const refresh = () => qc.invalidateQueries({ queryKey: ["reports"] })

  // ── KPI cards (real data) ──
  const cards = useMemo<KPICardData[]>(() => {
    const r = report.data
    const trend = r?.executionTrend ?? []
    const passSpark = trend.map((t) => t.passRate).slice(-7)
    const passChange = passSpark.length > 1 ? passSpark[passSpark.length - 1] - passSpark[0] : 0

    const openSpark = (defect.data ?? []).map((d) => d.cumulativeOpen).slice(-7)
    const openChange = openSpark.length > 1 ? openSpark[openSpark.length - 1] - openSpark[0] : 0

    const velSprints = velocity.data?.sprints ?? []
    const velSpark = velSprints.map((s) => s.completed).slice(-7)
    const velChange = velSpark.length > 1 ? velSpark[velSpark.length - 1] - velSpark[velSpark.length - 2] : 0

    const coverage = r ? (r.coverage.requirementsTotal ? Math.round((r.coverage.requirementsCovered / r.coverage.requirementsTotal) * 100) : 0) : 0

    // Active sprint day X/Y.
    const active = (sprints.data?.rows ?? []).find((s) => s.status === "Active") ?? (sprints.data?.rows ?? [])[0]
    let sprintValue = "—"
    let sprintProgress = 0
    if (active?.startDate && active?.endDate) {
      const start = new Date(active.startDate).getTime()
      const end = new Date(active.endDate).getTime()
      const totalDays = Math.max(1, Math.round((end - start) / 86400000))
      const dayNow = Math.min(totalDays, Math.max(0, Math.round((Date.now() - start) / 86400000)))
      sprintValue = `${dayNow} / ${totalDays}`
      sprintProgress = Math.round((dayNow / totalDays) * 100)
    }

    return [
      {
        key: "pass",
        label: "Pass rate",
        value: `${r?.summary.passRate ?? 0}%`,
        change: `${passChange >= 0 ? "+" : ""}${passChange}%`,
        trend: passChange > 0 ? "up" : passChange < 0 ? "down" : "neutral",
        icon: CheckCircle,
        color: "emerald",
        sparkline: passSpark,
        goodDirection: "up",
        targetId: "chart-defect-trend",
      },
      {
        key: "tests",
        label: "Test cases",
        value: (r?.summary.testCases ?? 0).toLocaleString(),
        change: `${r?.summary.automated ?? 0} auto`,
        trend: "neutral",
        icon: FileText,
        color: "blue",
        sparkline: [],
        targetId: "data-tables",
      },
      {
        key: "bugs",
        label: "Open bugs",
        value: String(r?.summary.openDefects ?? 0),
        change: `${openChange >= 0 ? "+" : ""}${openChange}`,
        trend: openChange > 0 ? "up" : openChange < 0 ? "down" : "neutral",
        icon: Bug,
        color: "rose",
        sparkline: openSpark,
        goodDirection: "down",
        targetId: "chart-defect-trend",
      },
      {
        key: "coverage",
        label: "Requirement coverage",
        value: `${coverage}%`,
        change: `${r?.coverage.requirementsCovered ?? 0}/${r?.coverage.requirementsTotal ?? 0}`,
        trend: "neutral",
        icon: ShieldCheck,
        color: "violet",
        sparkline: [],
        targetId: "chart-cfd",
      },
      {
        key: "velocity",
        label: "Velocity",
        value: `${velocity.data?.averageVelocity ?? 0} pts`,
        change: `${velChange >= 0 ? "+" : ""}${velChange}`,
        trend: velChange > 0 ? "up" : velChange < 0 ? "down" : "neutral",
        icon: Zap,
        color: "amber",
        sparkline: velSpark,
        goodDirection: "up",
        targetId: "chart-velocity",
      },
      {
        key: "sprint",
        label: "Sprint day",
        value: sprintValue,
        change: `${sprintProgress}%`,
        trend: "neutral",
        icon: Timer,
        color: "slate",
        sparkline: [],
        progress: sprintProgress,
        targetId: "chart-burndown",
      },
    ]
  }, [report.data, defect.data, velocity.data, sprints.data])

  const chartFor = (key: ChartKey) => {
    switch (key) {
      case "burndown":
        return <BurndownChart key="burndown" data={burndown.data} loading={burndown.isLoading} />
      case "velocity":
        return <VelocityChart key="velocity" data={velocity.data} loading={velocity.isLoading} />
      case "cfd":
        return <CumulativeFlowChart key="cfd" data={cfd.data} loading={cfd.isLoading} />
      case "defectTrend":
        return <DefectTrendChart key="defectTrend" data={defect.data} loading={defect.isLoading} />
      case "team":
        return <TeamPerformanceChart key="team" data={team.data} loading={team.isLoading} />
      case "funnel":
        return <ExecutionFunnelChart key="funnel" data={funnel.data} loading={funnel.isLoading} />
      case "taskCreatedResolved":
        return <CreatedResolvedChart key="taskCreatedResolved" data={taskCreatedResolved.data} loading={taskCreatedResolved.isLoading} />
      case "controlChart":
        return <ControlChart key="controlChart" data={controlChart.data} loading={controlChart.isLoading} />
    }
  }

  const visibleCharts = ROLE_CHARTS[role]
  const insights = useMemo(
    () => buildInsights({ report: report.data, defect: defect.data, burndown: burndown.data, funnel: funnel.data }),
    [report.data, defect.data, burndown.data, funnel.data]
  )

  return (
    <div className="min-h-full">
      <DashboardHeader
        projects={projects}
        projectId={projectId}
        onProject={(id) => {
          setProjectId(id)
          setSprintId(undefined)
        }}
        sprints={sprints.data?.rows ?? []}
        sprintId={sprintId}
        onSprint={setSprintId}
        preset={preset}
        onPreset={setPreset}
        from={custom.from}
        to={custom.to}
        onFrom={(v) => setCustom((c) => ({ ...c, from: v }))}
        onTo={(v) => setCustom((c) => ({ ...c, to: v }))}
        role={role}
        onRole={setRole}
        onRefresh={refresh}
        isFetching={anyFetching}
        lastUpdated={lastUpdated}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
        exportSlot={<ExportMenu report={report.data} captureRef={canvasRef} roleLabel={role} />}
      />

      {!projectId ? (
        <div className="p-16 text-center text-sm text-muted-foreground">
          {projects.length === 0 ? "No projects found. Create a project to see analytics." : "Select a project to begin."}
        </div>
      ) : (
        <div ref={canvasRef} className="space-y-6 p-6" style={{ colorScheme: "light" }}>
          <KPICards cards={cards} loading={report.isLoading && !report.data} />

          <Insights items={insights} />

          <div className="grid gap-6 lg:grid-cols-2">{visibleCharts.map((k) => chartFor(k))}</div>

          <TabbedTables projectId={projectId} />
        </div>
      )}
    </div>
  )
}
