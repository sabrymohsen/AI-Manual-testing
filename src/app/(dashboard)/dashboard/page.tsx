"use client"

import { CountUp } from "@/components/ui/count-up"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useActiveProject, useProjectSummary, useTestCaseMetrics, useBugMetrics, useRunMetrics, useScrumMetrics } from "@/hooks/use-metrics"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { Button } from "@/components/ui/button"
import {
  Zap,
  FileText,
  Bug,
  TrendingUp,
  Activity,
  FolderOpen,
  Layers
} from "@/components/ui/icons"
import { AssignedToMeWidget } from "@/components/dashboard/assigned-to-me-widget"
import { ActivityStream } from "@/components/dashboard/activity-stream"
import { SprintHealthCard } from "@/components/dashboard/sprint-health-card"
import { TeamWorkloadWidget } from "@/components/dashboard/team-workload-widget"
import { BugsBySeverityPie } from "@/components/dashboard/bugs-by-severity-pie"
import { TestsByStatusPie } from "@/components/dashboard/tests-by-status-pie"

interface ProjectItem {
  id: string
  name: string
  environment: string
  baseUrl: string
}

export default function DashboardPage() {
  const router = useRouter()
  const { activeProjectId } = useActiveProject()
  const { summary } = useProjectSummary(activeProjectId)

  const caseMetrics = useTestCaseMetrics(activeProjectId)
  const bugMetrics = useBugMetrics(activeProjectId)
  const runMetrics = useRunMetrics(activeProjectId)
  const scrum = useScrumMetrics(activeProjectId)

  const [projectsList, setProjectsList] = useState<ProjectItem[]>([])
  const [recentBugs, setRecentBugs] = useState<any[]>([])

  useEffect(() => {
    // Redirect admin users to the system administration dashboard
    fetch("/api/me")
      .then(res => {
        if (res.ok) return res.json()
        throw new Error()
      })
      .then(data => {
        if (data?.user?.role === "Admin") {
          router.push("/admin")
        }
      })
      .catch(() => {})

    // Load all projects for the workspace gate
    fetch("/api/projects")
      .then(res => res.json())
      .then(data => setProjectsList(data.projects || []))
      .catch(() => {})

    if (activeProjectId) {
      // Load recent defects for current scope
      fetch(`/api/projects/${activeProjectId}/bug-reports`)
        .then(res => res.json())
        .then(data => setRecentBugs((data.bugReports || []).slice(0, 5)))
        .catch(() => {})
    }
  }, [activeProjectId, router])

  const selectProject = (pId: string) => {
    localStorage.setItem("activeProjectId", pId)
    window.dispatchEvent(new Event("projectChanged"))
  }

  // Gateway Selection view when no project selected
  if (!activeProjectId) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 select-none text-xs font-semibold py-8">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-3xl font-semibold tracking-tight text-indigo-600 flex items-center justify-center md:justify-start gap-2">
            <Zap className="h-8 w-8 text-primary fill-current" /> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Choose a project to see its test health, run live sessions and capture defects.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projectsList.length === 0 ? (
            <div className="p-8 border border-dashed text-center space-y-4 col-span-2 rounded-xl bg-card">
              <FolderOpen className="mx-auto h-12 w-12 text-slate-350" />
              <div className="space-y-1">
                <h3 className="font-semibold text-sm text-foreground">No projects created</h3>
                <p className="text-xs text-muted-foreground font-medium">Get started by creating your first manual testing scope project.</p>
              </div>
              <Button onClick={() => router.push("/projects/new")} className="font-semibold">
                Create New Project
              </Button>
            </div>
          ) : (
            projectsList.map((p) => (
              <div 
                key={p.id}
                onClick={() => selectProject(p.id)}
                className="p-6 border border-border hover:border-border hover:shadow-md cursor-pointer transition-all rounded-xl space-y-4 flex flex-col justify-between group bg-card"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{p.name}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/25">{p.environment}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed truncate">
                    {p.baseUrl || "No target application URL set"}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs border-t pt-3 font-semibold text-primary">
                  <span>Enter Workspace Scope</span>
                  <Zap className="h-3.5 w-3.5 fill-current opacity-70 group-hover:scale-110 transition-transform" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none">
      <AppPageHeader 
        title="Executive Monitoring Control"
        subtitle="Real-time view of project quality metrics, pass rates, open defects counts, and integration health."
        breadcrumb="Executive Hub > Dashboard"
      />

      <ActiveProjectContextBar projectId={activeProjectId} />

      {/* Monitoring Grid — 4 original KPI cards */}
      <div className="stagger grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        {/* Pass rate card */}
        <div className="hover-lift space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="caption-4 text-muted-foreground">Pass Rate</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10"><TrendingUp className="h-4 w-4 text-emerald-600" /></span>
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-semibold text-foreground"><CountUp value={summary?.passRate ?? 0} />%</span>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-[width] duration-700 ease-out-soft" 
                style={{ width: `${summary?.passRate ?? 0}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Based on latest test execution outputs.</p>
        </div>

        {/* User stories by board column. The dashboard previously reported test
            cases, bugs and runs but said nothing about the work itself — how
            much is still to do, and how much is sitting in Testing. */}
        <div className="hover-lift space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="caption-4 text-muted-foreground">User Stories</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10"><Layers className="h-4 w-4 text-violet-600" /></span>
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-semibold text-foreground">
              <CountUp value={scrum.metrics?.stories.total ?? 0} /> total
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <span className="text-muted-foreground font-semibold">
                {scrum.metrics?.stories.byStatus.TODO ?? 0} to do
              </span>
              <span>•</span>
              <span className="text-amber-600 font-semibold">
                {scrum.metrics?.stories.byStatus.TESTING ?? 0} testing
              </span>
              <span>•</span>
              <span className="text-emerald-600 font-semibold">
                {scrum.metrics?.stories.done ?? 0} done
              </span>
            </div>
          </div>

          {/* Full column breakdown, so nothing is hidden behind the headline. */}
          {(scrum.metrics?.stories.total ?? 0) > 0 && (
            <div className="space-y-2 pt-0.5">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                {([
                  ["TODO", "bg-slate-400"],
                  ["IN_PROGRESS", "bg-blue-500"],
                  ["REVIEW", "bg-violet-500"],
                  ["TESTING", "bg-amber-500"],
                  ["DEPLOYED", "bg-cyan-500"],
                  ["DONE", "bg-emerald-500"],
                ] as const).map(([key, colour]) => {
                  const n = scrum.metrics!.stories.byStatus[key] ?? 0
                  if (n === 0) return null
                  return (
                    <div
                      key={key}
                      className={colour}
                      style={{ width: `${(n / scrum.metrics!.stories.total) * 100}%` }}
                      title={`${n} ${key.replace("_", " ").toLowerCase()}`}
                    />
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {scrum.metrics!.stories.completionPct}% complete
                {scrum.metrics!.stories.totalPoints > 0 && ` · ${scrum.metrics!.stories.totalPoints} pts`}
                {scrum.metrics!.activeSprint && ` · ${scrum.metrics!.activeSprint.name}`}
              </p>
            </div>
          )}

          {(scrum.metrics?.stories.total ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground font-medium">
              No stories on the board yet.
            </p>
          )}
        </div>

        {/* Test Case Breakdown */}
        <div className="hover-lift space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="caption-4 text-muted-foreground">Test Cases</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10"><FileText className="h-4 w-4 text-indigo-600" /></span>
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-semibold text-foreground"><CountUp value={caseMetrics.total} /> total</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <span className="text-primary font-semibold">{caseMetrics.manual} manual</span>
              <span>•</span>
              <span className="text-emerald-600 font-semibold">{caseMetrics.automated} auto</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Suites configured in Cockpit.</p>
        </div>

        {/* Open Bugs card */}
        <div className="hover-lift space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="caption-4 text-muted-foreground">Open Defects</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10"><Bug className="h-4 w-4 text-rose-600" /></span>
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-semibold text-rose-600"><CountUp value={bugMetrics.open} /> bugs</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <span className="text-amber-600 font-semibold">{bugMetrics.fixed} fixed</span>
              <span>•</span>
              <span className="text-muted-foreground font-semibold">{bugMetrics.closed} closed</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Defects awaiting sync maps.</p>
        </div>

        {/* Test Runs status */}
        <div className="hover-lift space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="caption-4 text-muted-foreground">Total runs</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10"><Activity className="h-4 w-4 text-sky-600" /></span>
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-semibold text-foreground"><CountUp value={runMetrics.total} /> runs</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <span className="text-emerald-600 font-semibold">{runMetrics.passed} passed</span>
              <span>•</span>
              <span className="text-rose-600 font-semibold">{runMetrics.failed} failed</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Playwright + manual test runs.</p>
        </div>
      </div>

      {/* NEW: Sprint Health + Team Workload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SprintHealthCard projectId={activeProjectId} />
        <TeamWorkloadWidget projectId={activeProjectId} />
      </div>

      {/* NEW: Pie Chart Gadgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BugsBySeverityPie projectId={activeProjectId} />
        <TestsByStatusPie projectId={activeProjectId} />
      </div>

      {/* NEW: Assigned to Me + Activity Stream */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AssignedToMeWidget projectId={activeProjectId} />
        <ActivityStream projectId={activeProjectId} />
      </div>

      {/* Recent Defects */}
      <div className="p-6 border border-border shadow-sm space-y-4 rounded-xl bg-card">
        <span className="text-xs font-medium text-muted-foreground/60 block border-b pb-2">Recent Defect Logs</span>
        {recentBugs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No defects recorded in this workspace scope yet.</p>
        ) : (
          <div className="space-y-2">
            {recentBugs.map((bug) => (
              <div 
                key={bug.id} 
                onClick={() => router.push(`/projects/${activeProjectId}/bug-reports`)}
                className="p-2 border rounded-lg border-border hover:bg-muted/50 cursor-pointer flex items-center justify-between transition-colors"
              >
                <div className="space-y-0.5 min-w-0">
                  <span className="font-semibold text-foreground block truncate">{bug.title}</span>
                  <span className="text-xs text-muted-foreground block">{bug.bugKey || "Not synced"} • Severity: {bug.severity}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
                  bug.status === "Open" ? "bg-red-50 text-rose-600 border border-red-100" :
                  bug.status === "Fixed" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-muted text-muted-foreground"
                }`}>
                  {bug.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
