import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"

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
 *              status values. No translation to a foreign vocabulary: a
 *              ReadyForRetest bug says ReadyForRetest in the report.
 *
 * Read-only and member-level: anyone who can see the bug list can export it.
 */

/** Suite tree is flattened to one row per suite; children roll up into their own row. */
interface ServiceRow {
  name: string
  total: number
  passed: number
  failed: number
  blocked: number
  status: string
  remarks: string
}

/** Derive a suite's overall verdict from its counts, using the app's vocabulary. */
function deriveStatus(row: Omit<ServiceRow, "status" | "remarks">): string {
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

  const [project, suites, testCases, bugs] = await Promise.all([
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
        testCase: { select: { title: true, suite: { select: { name: true } } } }
      },
      orderBy: { createdAt: "asc" }
    })
  ])

  if (!project) return unauthorizedResponse("Project not found")

  // ── Services ──────────────────────────────────────────────────────────────
  const buckets = new Map<string, ServiceRow>()
  for (const s of suites) {
    buckets.set(s.id, { name: s.name, total: 0, passed: 0, failed: 0, blocked: 0, status: "", remarks: "" })
  }
  const UNFILED = "__unfiled__"
  buckets.set(UNFILED, { name: "Unfiled", total: 0, passed: 0, failed: 0, blocked: 0, status: "", remarks: "" })

  for (const tc of testCases) {
    const row = buckets.get(tc.suiteId ?? UNFILED) ?? buckets.get(UNFILED)!
    row.total += 1
    if (tc.lastStatus === "Passed") row.passed += 1
    else if (tc.lastStatus === "Failed") row.failed += 1
    else if (tc.lastStatus === "Blocked") row.blocked += 1
  }

  const services = Array.from(buckets.entries())
    // An empty "Unfiled" bucket is noise; an empty suite is a real (untested) row.
    .filter(([key, row]) => key !== UNFILED || row.total > 0)
    .map(([, row]) => ({ ...row, status: deriveStatus(row) }))

  // ── Defects ───────────────────────────────────────────────────────────────
  const defects = bugs.map(b => ({
    key: b.bugKey || "",
    title: b.title,
    severity: b.severity,
    priority: b.priority,
    status: b.status,
    area: b.testCase?.suite?.name || b.testCase?.title || "",
    assignedTo: b.assignedTo || "",
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
