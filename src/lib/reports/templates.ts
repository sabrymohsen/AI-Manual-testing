/**
 * Role-based report templates. Each role maps to an ordered list of section keys
 * per scope (org roll-up vs per-project). Sections are reusable components keyed
 * by these strings (see src/components/reports/sections.tsx), so composing a new
 * audience is just picking a different ordering of the same building blocks.
 */
import type { ReportRole } from "./types"

export type OrgSectionKey =
  | "orgSummary"
  | "orgPassTrend"
  | "orgProjectsTable"
  | "orgDefectsByProject"
  | "orgDefectsBySeverity"
  | "orgDefectsByStatus"
  | "orgTopRisks"

export type ProjectSectionKey =
  | "projSummary"
  | "projExecutionTrend"
  | "projRunStatus"
  | "projFunnel"
  | "projCoverage"
  | "projDefectsBySeverity"
  | "projDefectsByStatus"
  | "projDefectsByComponent"
  | "projDefectLifecycle"
  | "projAutomation"
  | "projFailedTests"
  | "projTraceability"

export interface TemplateDef {
  role: ReportRole
  label: string
  audience: string
  org: OrgSectionKey[]
  project: ProjectSectionKey[]
}

export const REPORT_TEMPLATES: Record<ReportRole, TemplateDef> = {
  PM: {
    role: "PM",
    label: "Project Manager",
    audience: "Status, delivery risk, defect health at a glance.",
    org: ["orgSummary", "orgPassTrend", "orgDefectsByProject", "orgTopRisks", "orgProjectsTable"],
    project: ["projSummary", "projExecutionTrend", "projDefectLifecycle", "projDefectsBySeverity"],
  },
  PA: {
    role: "PA",
    label: "Product Analyst",
    audience: "Requirements coverage, traceability, feature scope.",
    org: ["orgSummary", "orgProjectsTable", "orgDefectsByStatus"],
    project: ["projSummary", "projCoverage", "projTraceability", "projDefectsByComponent"],
  },
  TestManager: {
    role: "TestManager",
    label: "Test Manager",
    audience: "Execution, coverage, defect trends across the portfolio.",
    org: ["orgSummary", "orgPassTrend", "orgProjectsTable", "orgDefectsBySeverity", "orgDefectsByProject"],
    project: ["projSummary", "projExecutionTrend", "projRunStatus", "projCoverage", "projDefectsBySeverity", "projDefectsByStatus"],
  },
  TestLead: {
    role: "TestLead",
    label: "Test Lead",
    audience: "Detailed execution, failing tests, defect breakdown.",
    org: ["orgSummary", "orgPassTrend", "orgTopRisks"],
    project: ["projSummary", "projFunnel", "projRunStatus", "projFailedTests", "projDefectsBySeverity", "projDefectsByComponent"],
  },
  TechLead: {
    role: "TechLead",
    label: "Tech Lead",
    audience: "Automation health, flakiness, self-healing, run performance.",
    org: ["orgSummary", "orgPassTrend"],
    project: ["projSummary", "projAutomation", "projExecutionTrend", "projFailedTests", "projFunnel"],
  },
}

export const ROLE_ORDER: ReportRole[] = ["PM", "PA", "TestManager", "TestLead", "TechLead"]
