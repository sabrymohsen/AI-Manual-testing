/**
 * Normalized report datasets shared by the aggregation layer, the API routes,
 * the on-screen report sections, and the exporters (PDF/Word/Excel).
 */

export interface DateRangeInput {
  from?: string | null
  to?: string | null
}

export interface CountBucket {
  label: string
  value: number
}

export interface TrendPoint {
  date: string // YYYY-MM-DD
  passed: number
  failed: number
  total: number
  passRate: number // 0..100
}

export interface OrgProjectRow {
  projectId: string
  name: string
  environment: string
  testCases: number
  runs: number
  passRate: number
  openDefects: number
  totalDefects: number
}

export interface RiskItem {
  bugKey: string
  title: string
  severity: string
  status: string
  project: string
}

export interface OrgReport {
  scope: "org"
  generatedAt: string
  range: { from: string; to: string }
  totals: {
    projects: number
    testCases: number
    runs: number
    passRate: number
    openDefects: number
    totalDefects: number
  }
  projects: OrgProjectRow[]
  passRateTrend: TrendPoint[]
  defectsBySeverity: CountBucket[]
  defectsByStatus: CountBucket[]
  defectsByProject: CountBucket[]
  topRisks: RiskItem[]
}

export interface TraceRow {
  key: string
  title: string
  status: string
  linkedCases: number
}

export interface FailedTestRow {
  title: string
  lastStatus: string
  runs: number
}

export interface ProjectReport {
  scope: "project"
  generatedAt: string
  range: { from: string; to: string }
  project: { id: string; name: string; environment: string }
  summary: {
    testCases: number
    automated: number
    manual: number
    runs: number
    passRate: number
    openDefects: number
    totalDefects: number
    requirements: number
  }
  executionTrend: TrendPoint[]
  runStatus: CountBucket[]
  coverage: {
    requirementsTotal: number
    requirementsCovered: number
    requirementsUncovered: number
    automated: number
    manual: number
  }
  defectsBySeverity: CountBucket[]
  defectsByStatus: CountBucket[]
  defectsByComponent: CountBucket[]
  automation: {
    healingEvents: number
    healingSuccess: number
    avgRunDurationMs: number
    flakyCount: number
  }
  funnel: { total: number; executed: number; passed: number }
  defectLifecycle: { open: number; inProgress: number; fixed: number; closed: number }
  failedTests: FailedTestRow[]
  requirementsTraceability: TraceRow[]
}

export type AnyReport = OrgReport | ProjectReport

/** The five role-based report templates. */
export type ReportRole = "PM" | "PA" | "TestManager" | "TestLead" | "TechLead"
