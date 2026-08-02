/**
 * Generates realistic demo content for the Test library so the layout can be
 * judged with real data rather than one row called "testat".
 *
 *   npx tsx scripts/seed-test-library-demo.ts --project <projectId>
 *   npx tsx scripts/seed-test-library-demo.ts --project <projectId> --count 250
 *   npx tsx scripts/seed-test-library-demo.ts --project <projectId> --clean
 *
 * Creates a suite tree, test cases spread across every status/priority/type,
 * steps, completed test runs, and bugs against some failures — then fills the
 * execution rollup so the list, facets and suite counts all show real numbers.
 *
 * `--clean` removes only what this script created (titles are prefixed with
 * [demo]), so it never touches real work.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const DEMO = "[demo]"

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const PROJECT_ID = arg("project")
const COUNT = Number(arg("count") ?? 120)
const CLEAN = process.argv.includes("--clean")

const SUITES: { name: string; children: string[] }[] = [
  { name: "Authentication", children: ["Login", "Password reset", "Session handling"] },
  { name: "Checkout", children: ["Cart", "Payment", "Order confirmation"] },
  { name: "Account", children: ["Profile", "Notifications"] },
  { name: "Search & browse", children: ["Filters", "Results"] },
  { name: "Admin", children: [] },
]

const VERBS = ["Verify", "Check", "Ensure", "Confirm", "Validate"]
const SUBJECTS = [
  "a valid user can sign in with email and password",
  "an expired session redirects to the login page",
  "the reset link expires after 24 hours",
  "a saved card completes checkout",
  "an out-of-stock item cannot be added to the cart",
  "the order total includes tax and shipping",
  "profile changes persist after a reload",
  "notification preferences survive a sign-out",
  "search returns results ranked by relevance",
  "an empty search shows the zero state",
  "filters combine with AND semantics",
  "pagination preserves the active filters",
  "an admin can deactivate a member",
  "a deactivated member loses project access",
  "rate limiting blocks a sixth login attempt",
  "uploading an oversized avatar shows an inline error",
]

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const
const EXEC = ["Manual", "Automated"] as const
const STATUSES = ["Passed", "Failed", "Blocked", "Warning", "Skipped", "NotExecuted"] as const
// Weighted so the list looks like a real project: mostly passing, some noise.
const STATUS_WEIGHTS = [50, 14, 5, 5, 4, 22]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function weighted<T>(arr: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i]
    if (r <= 0) return arr[i]
  }
  return arr[arr.length - 1]
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

async function clean(projectId: string) {
  const cases = await prisma.testCase.findMany({
    where: { projectId, title: { startsWith: DEMO } },
    select: { id: true },
  })
  const ids = cases.map((c) => c.id)

  if (ids.length) {
    await prisma.bugReport.deleteMany({ where: { testCaseId: { in: ids } } })
    await prisma.testRun.deleteMany({ where: { testCaseId: { in: ids } } })
    await prisma.testStep.deleteMany({ where: { testCaseId: { in: ids } } })
    await prisma.testCase.deleteMany({ where: { id: { in: ids } } })
  }
  // Child suites first — the FK cascades, but deleting roots first would orphan
  // the name lookup below.
  await prisma.testSuite.deleteMany({ where: { projectId, name: { startsWith: DEMO } } })

  console.log(`Removed ${ids.length} demo test case(s) and their demo suites.`)
}

async function main() {
  if (!PROJECT_ID) {
    console.error("Missing --project <projectId>.\n")
    const projects = await prisma.project.findMany({ select: { id: true, name: true }, take: 20 })
    console.error("Projects in this database:")
    for (const p of projects) console.error(`  ${p.id}  ${p.name}`)
    process.exitCode = 1
    return
  }

  const project = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, userId: true },
  })
  if (!project) {
    console.error(`Project ${PROJECT_ID} not found.`)
    process.exitCode = 1
    return
  }

  if (CLEAN) {
    await clean(project.id)
    return
  }

  console.log(`Seeding ${COUNT} demo test cases into "${project.name}"…\n`)

  // ── Suites ────────────────────────────────────────────────────────────────
  const leafSuiteIds: string[] = []
  for (const [i, group] of SUITES.entries()) {
    const parent = await prisma.testSuite.create({
      data: { projectId: project.id, name: `${DEMO} ${group.name}`, orderIndex: i },
    })
    if (group.children.length === 0) {
      leafSuiteIds.push(parent.id)
      continue
    }
    for (const [j, child] of group.children.entries()) {
      const c = await prisma.testSuite.create({
        data: {
          projectId: project.id,
          parentId: parent.id,
          name: `${DEMO} ${child}`,
          orderIndex: j,
        },
      })
      leafSuiteIds.push(c.id)
    }
  }
  console.log(`  suites            ${SUITES.length} parents, ${leafSuiteIds.length} leaves`)

  // ── Cases ─────────────────────────────────────────────────────────────────
  let runs = 0
  let bugs = 0
  const statusTally: Record<string, number> = {}

  for (let i = 0; i < COUNT; i++) {
    const status = weighted(STATUSES, STATUS_WEIGHTS)
    const executionType = pick(EXEC)
    // ~12% left unfiled so the Unfiled bucket isn't empty.
    const suiteId = Math.random() < 0.12 ? null : pick(leafSuiteIds)
    const settled = status !== "NotExecuted"
    const lastRunAt = settled ? daysAgo(Math.floor(Math.random() * 30)) : null

    const testCase = await prisma.testCase.create({
      data: {
        projectId: project.id,
        title: `${DEMO} ${pick(VERBS)} ${pick(SUBJECTS)}`,
        priority: pick(PRIORITIES) as any,
        executionType: executionType as any,
        source: "Manual",
        preconditions: Math.random() < 0.6 ? "A seeded account exists and the app is reachable." : null,
        tags: Math.random() < 0.5 ? [pick(["smoke", "regression", "critical-path", "api", "ui"])] : [],
        suiteId,
        lastStatus: status as any,
        lastRunAt,
        lastRunSource: settled ? (executionType as any) : null,
        steps: {
          // actionType/targetType are enums — every value below is checked
          // against ActionType / TargetType in schema.prisma. ("assert" is NOT
          // a member; the assertion actions are assert_visible / assert_text.)
          create: Array.from({ length: 2 + Math.floor(Math.random() * 4) }).map((_, n) => ({
            stepNumber: n + 1,
            actionDescription: pick([
              "Open the application",
              "Enter valid credentials",
              "Press the primary action",
              "Wait for the confirmation banner",
              "Reload the page",
            ]),
            actionType: pick([
              "open_url",
              "click",
              "fill",
              "assert_visible",
              "assert_text",
            ]) as any,
            targetType: pick(["css", "test_id", "role", "text"]) as any,
            targetValue: pick(["#submit", "[data-testid='confirm']", "button.primary", ".alert"]),
            expectedResult: pick([
              "The page loads without errors",
              "An inline confirmation appears",
              "The record is persisted",
            ]),
          })),
        },
      },
    })
    statusTally[status] = (statusTally[status] ?? 0) + 1

    // A completed run behind each settled verdict.
    if (settled && lastRunAt) {
      const runStatus = status === "Skipped" ? "Cancelled" : status
      const run = await prisma.testRun.create({
        data: {
          projectId: project.id,
          testCaseId: testCase.id,
          status: runStatus as any,
          // browserType and viewport are required on TestRun — no defaults.
          browserType: "Chromium" as any,
          viewport: "Desktop" as any,
          startedAt: new Date(lastRunAt.getTime() - 30_000),
          completedAt: lastRunAt,
          durationMs: 1500 + Math.floor(Math.random() * 20_000),
        },
      })
      await prisma.testCase.update({ where: { id: testCase.id }, data: { lastRunId: run.id } })
      runs++
    }

    // Bugs against ~60% of failures, so "broken links" has real signal:
    // the remaining failures are exactly the ones with no bug filed.
    if (status === "Failed" && Math.random() < 0.6) {
      const count = await prisma.bugReport.count({ where: { projectId: project.id } })
      await prisma.bugReport.create({
        data: {
          bugKey: `BUG-${String(count + 1).padStart(4, "0")}`,
          projectId: project.id,
          testCaseId: testCase.id,
          title: `${DEMO} ${testCase.title.replace(`${DEMO} `, "")} — fails`,
          severity: pick(["Low", "Medium", "High", "Critical"]) as any,
          priority: pick(PRIORITIES) as any,
          status: "Open" as any,
          reporterId: project.userId,
          stepsToReproduce: "1. Follow the case steps\n2. Observe the failure",
          expectedResult: "The step passes",
          actualResult: "The step fails with an assertion error",
        },
      })
      await prisma.testCase.update({
        where: { id: testCase.id },
        data: { openBugCount: 1 },
      })
      bugs++
    }
  }

  console.log(`  test cases        ${COUNT}`)
  console.log(`  completed runs    ${runs}`)
  console.log(`  bugs filed        ${bugs}`)
  console.log(`  status spread     ${Object.entries(statusTally).map(([k, v]) => `${k}:${v}`).join("  ")}`)
  console.log(`\nOpen: /projects/${project.id}/test-cases`)
  console.log(`Remove later with: npx tsx scripts/seed-test-library-demo.ts --project ${project.id} --clean`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
