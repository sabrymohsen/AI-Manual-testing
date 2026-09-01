import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { buildAssigneeNameMap, assigneeName } from "@/lib/bug-reports/assignees"

/**
 * Data feed for the downloadable QA / UAT testing report.
 *
 * The report is a single self-contained HTML file the tester downloads, edits
 * offline and forwards. Everything it shows is pre-filled from here so the
 * tester starts from real numbers rather than an empty template:
 *
 *   services — the project's test suites (plus an "Unfiled" bucket when cases
 *              sit outside every suite), with pass/fail/blocked counts read
 *              from TestCase.lastStatus. Suites are the only grouping in the
 *              schema that partitions cases exactly once, so the rows sum to
 *              the project total; requirement links are many-to-many and would
 *              double-count.
 *   defects  — one row per bug, carrying the app's OWN severity/priority and
 *              status values, and the module it is filed under. No translation
 *              to a foreign vocabulary: a ReadyForRetest bug says
 *              ReadyForRetest in the report.
 *
 * Defects and modules meet on BugReport.suiteId — the bug's own link, so a
 * defect filed by hand during exploratory testing lands in the right section
 * even though it points at no test case.
 *
 * Read-only and member-level: anyone who can see the bug list can export it.
 */

/** Suite tree is flattened to one row per suite; children roll up into their own row. */
interface ServiceRow {
  /**
   * The module this row came from, or null for the synthetic "Unfiled" bucket.
   *
   * Returned so the report editor can tell a row that is a real project module
   * from one typed into the report, and so renaming a row updates that module
   * rather than creating a second one beside it.
   */
  suiteId: string | null
  name: string
  total: number
  passed: number
  failed: number
  blocked: number
  status: string
  remarks: string
}

/**
 * One label for "no module", used by the row, the chart and the defect log so
 * they cannot disagree. Bugs and cases both fall here when unfiled.
 */
const UNFILED_LABEL = "Unfiled"

/** Derive a suite's overall verdict from its counts, using the app's vocabulary. */
function deriveStatus(row: Pick<ServiceRow, "total" | "passed" | "failed" | "blocked">): string {
  const executed = row.passed + row.failed + row.blocked
  if (row.total === 0) return "Not Started"
  if (executed === 0) return "Not Started"
  if (executed < row.total) return "In Progress"
  if (row.blocked > 0) return "Blocked"
  if (row.failed === 0) return "Passed"
  if (row.failed / row.total <= 0.1) return "Passed with minor issues"
  return "Passed with some issues"
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  const projectId = params.projectId

  const [project, suites, testCases, bugs, assigneeNames] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, environment: true, description: true }
    }),
    prisma.testSuite.findMany({
      where: { projectId },
      select: { id: true, name: true, orderIndex: true },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }]
    }),
    prisma.testCase.findMany({
      where: { projectId },
      select: { suiteId: true, lastStatus: true }
    }),
    prisma.bugReport.findMany({
      where: {
        OR: [
          { projectId },
          { testRun: { projectId } },
          { manualTestSession: { projectId } }
        ]
      },
      select: {
        id: true,
        bugKey: true,
        title: true,
        severity: true,
        priority: true,
        status: true,
        environment: true,
        assignedTo: true,
        createdAt: true,
        suiteId: true,
        suite: { select: { id: true, name: true } },
        testCase: { select: { title: true } }
      },
      orderBy: { createdAt: "asc" }
    }),
    // Names for the tracker user ids stored on the bugs. A report that credits
    // a defect to "62" tells the reader nothing.
    buildAssigneeNameMap(projectId)
  ])

  if (!project) return unauthorizedResponse("Project not found")

  // ── Services ──────────────────────────────────────────────────────────────
  const blank = (name: string, suiteId: string | null = null): ServiceRow => ({
    suiteId, name, total: 0, passed: 0, failed: 0, blocked: 0, status: "", remarks: ""
  })

  const buckets = new Map<string, ServiceRow>()
  for (const s of suites) buckets.set(s.id, blank(s.name, s.id))
  const UNFILED = "__unfiled__"
  buckets.set(UNFILED, blank(UNFILED_LABEL))

  for (const tc of testCases) {
    const row = buckets.get(tc.suiteId ?? UNFILED) ?? buckets.get(UNFILED)!
    row.total += 1
    if (tc.lastStatus === "Passed") row.passed += 1
    else if (tc.lastStatus === "Failed") row.failed += 1
    else if (tc.lastStatus === "Blocked") row.blocked += 1
  }

  // Per-module defect counts are NOT stored on the row: the report derives them
  // from the defect list so that re-filing a defect in the downloaded file moves
  // its count in the same click. The tally here only decides whether the
  // "Unfiled" row is worth showing at all.
  const unfiledDefects = bugs.filter(b => !b.suiteId).length

  const services = Array.from(buckets.entries())
    // An empty "Unfiled" bucket is noise; an empty suite is a real (untested) row.
    .filter(([key, row]) => key !== UNFILED || row.total > 0 || unfiledDefects > 0)
    .map(([, row]) => ({ ...row, status: deriveStatus(row) }))

  // ── Defects ───────────────────────────────────────────────────────────────
  const defects = bugs.map(b => ({
    // The bug behind the row. The report editor writes an edited module,
    // severity, priority or status back to this bug, so the Bug Reports page
    // and the report cannot disagree about a defect they both describe.
    id: b.id,
    key: b.bugKey || "",
    title: b.title,
    severity: b.severity,
    priority: b.priority,
    status: b.status,
    // The module the defect is filed under. Its own link now, so a bug filed by
    // hand during exploratory testing lands in the right section of the report
    // even though it points at no test case.
    module: b.suite?.name || UNFILED_LABEL,
    area: b.testCase?.title || "",
    assignedTo: assigneeName(b.assignedTo, assigneeNames),
    reportedOn: b.createdAt.toISOString().slice(0, 10)
  }))

  const today = new Date().toISOString().slice(0, 10)
  const firstBug = bugs[0]?.createdAt
  const dateRange = firstBug ? `${firstBug.toISOString().slice(0, 10)} – ${today}` : today

  return NextResponse.json({
    meta: {
      title: `${project.name} — QA Testing Report`,
      org: "",
      system: project.name,
      environment: project.environment,
      dateRange,
      overallStatus: "",
      engineer: session.user.name || session.user.email || "",
      reportDate: today,
      fileName: `QA-Testing-Report-${project.name}`
    },
    services,
    defects
  })
}
