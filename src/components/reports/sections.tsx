"use client"

/**
 * Report body renderer — given a dataset + role template, renders the ordered
 * list of sections for the report's scope (org or project). Each section key
 * maps to a titled block of charts/tables from ./charts.
 */
import type { OrgReport, ProjectReport, AnyReport, ReportRole } from "@/lib/reports/types"
import { REPORT_TEMPLATES, type OrgSectionKey, type ProjectSectionKey } from "@/lib/reports/templates"
import {
  ChartCard, StatTiles, TrendLine, BucketBar, StatusPie, CoverageDonut,
  ExecutionFunnel, DefectLifecycleFlow, DataTable,
} from "./charts"

function fmtMs(ms: number): string {
  if (!ms) return "0s"
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function OrgSection({ k, r }: { k: OrgSectionKey; r: OrgReport }) {
  switch (k) {
    case "orgSummary":
      return (
        <StatTiles tiles={[
          { label: "Projects", value: r.totals.projects },
          { label: "Test Cases", value: r.totals.testCases },
          { label: "Pass Rate", value: `${r.totals.passRate}%`, tone: "text-emerald-600" },
          { label: "Runs", value: r.totals.runs },
          { label: "Open Defects", value: r.totals.openDefects, tone: "text-rose-600" },
          { label: "Total Defects", value: r.totals.totalDefects },
        ]} />
      )
    case "orgPassTrend":
      return <ChartCard title="Pass rate trend (all projects)"><TrendLine data={r.passRateTrend} /></ChartCard>
    case "orgDefectsByProject":
      return <ChartCard title="Defects by project"><BucketBar data={r.defectsByProject} /></ChartCard>
    case "orgDefectsBySeverity":
      return <ChartCard title="Defects by severity"><StatusPie data={r.defectsBySeverity} colorBy="severity" /></ChartCard>
    case "orgDefectsByStatus":
      return <ChartCard title="Defects by status"><StatusPie data={r.defectsByStatus} colorBy="status" /></ChartCard>
    case "orgTopRisks":
      return (
        <ChartCard title="Top open risks (Critical / High)">
          <DataTable columns={["Key", "Title", "Severity", "Status", "Project"]}
            rows={r.topRisks.map((x) => [x.bugKey, x.title, x.severity, x.status, x.project])} />
        </ChartCard>
      )
    case "orgProjectsTable":
      return (
        <ChartCard title="Projects summary">
          <DataTable columns={["Project", "Env", "Cases", "Runs", "Pass %", "Open", "Total"]}
            rows={r.projects.map((p) => [p.name, p.environment, p.testCases, p.runs, `${p.passRate}%`, p.openDefects, p.totalDefects])} />
        </ChartCard>
      )
  }
}

function ProjectSection({ k, r }: { k: ProjectSectionKey; r: ProjectReport }) {
  switch (k) {
    case "projSummary":
      return (
        <StatTiles tiles={[
          { label: "Test Cases", value: r.summary.testCases },
          { label: "Pass Rate", value: `${r.summary.passRate}%`, tone: "text-emerald-600" },
          { label: "Runs", value: r.summary.runs },
          { label: "Requirements", value: r.summary.requirements },
          { label: "Open Defects", value: r.summary.openDefects, tone: "text-rose-600" },
          { label: "Automated", value: r.summary.automated },
        ]} />
      )
    case "projExecutionTrend":
      return <ChartCard title="Execution pass-rate trend"><TrendLine data={r.executionTrend} /></ChartCard>
    case "projRunStatus":
      return <ChartCard title="Run outcomes"><BucketBar data={r.runStatus} colorBy="status" /></ChartCard>
    case "projFunnel":
      return <ChartCard title="Test execution funnel"><ExecutionFunnel total={r.funnel.total} executed={r.funnel.executed} passed={r.funnel.passed} /></ChartCard>
    case "projCoverage":
      return (
        <ChartCard title="Requirements coverage">
          <CoverageDonut covered={r.coverage.requirementsCovered} uncovered={r.coverage.requirementsUncovered} />
          <div className="text-[11px] text-slate-500 mt-2 text-center">
            {r.coverage.requirementsCovered}/{r.coverage.requirementsTotal} requirements covered · {r.coverage.automated} automated / {r.coverage.manual} manual cases
          </div>
        </ChartCard>
      )
    case "projDefectsBySeverity":
      return <ChartCard title="Defects by severity"><StatusPie data={r.defectsBySeverity} colorBy="severity" /></ChartCard>
    case "projDefectsByStatus":
      return <ChartCard title="Defects by status"><StatusPie data={r.defectsByStatus} colorBy="status" /></ChartCard>
    case "projDefectsByComponent":
      return <ChartCard title="Defects by source / component"><BucketBar data={r.defectsByComponent} /></ChartCard>
    case "projDefectLifecycle":
      return <ChartCard title="Defect lifecycle"><DefectLifecycleFlow {...r.defectLifecycle} /></ChartCard>
    case "projAutomation":
      return (
        <ChartCard title="Automation health">
          <StatTiles tiles={[
            { label: "Flaky Tests", value: r.automation.flakyCount, tone: "text-amber-600" },
            { label: "Self-heal Events", value: r.automation.healingEvents },
            { label: "Heals Recovered", value: r.automation.healingSuccess, tone: "text-emerald-600" },
            { label: "Avg Run Time", value: fmtMs(r.automation.avgRunDurationMs) },
          ]} />
        </ChartCard>
      )
    case "projFailedTests":
      return (
        <ChartCard title="Recently failing tests">
          <DataTable columns={["Test case", "Last outcome", "Runs"]}
            rows={r.failedTests.map((t) => [t.title, t.lastStatus, t.runs])} />
        </ChartCard>
      )
    case "projTraceability":
      return (
        <ChartCard title="Requirements traceability">
          <DataTable columns={["Key", "Requirement", "Status", "Linked cases"]}
            rows={r.requirementsTraceability.map((t) => [t.key, t.title, t.status, t.linkedCases])} />
        </ChartCard>
      )
  }
}

export function ReportBody({ report, role }: { report: AnyReport; role: ReportRole }) {
  const tpl = REPORT_TEMPLATES[role]
  if (report.scope === "org") {
    return (
      <div className="space-y-4">
        {tpl.org.map((k) => <div key={k}><OrgSection k={k} r={report} /></div>)}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {tpl.project.map((k) => <div key={k}><ProjectSection k={k} r={report} /></div>)}
    </div>
  )
}
