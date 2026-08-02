/**
 * Backfill for 20260802000000_test_suites_and_execution_rollup.
 *
 *   npx tsx scripts/backfill-test-suites.ts            # dry run, reports only
 *   npx tsx scripts/backfill-test-suites.ts --apply    # writes
 *   npx tsx scripts/backfill-test-suites.ts --apply --project <projectId>
 *
 * Two independent jobs, both idempotent — safe to re-run:
 *
 *   1. SUITES. Creates one suite per Epic, one child suite per Feature, and
 *      files each test case under the feature of its primary (first-linked)
 *      story. Cases with no story link stay unfiled (suiteId null) and show
 *      under "Unfiled" in the UI.
 *
 *   2. ROLLUP. Populates lastStatus / lastRunAt / lastRunId / lastRunSource /
 *      openBugCount from existing TestRun, ManualSessionCase and BugReport
 *      rows. Whichever of the automated or manual result completed later wins.
 */
import { PrismaClient, type TestCaseStatus, type ExecutionType } from "@prisma/client"

const prisma = new PrismaClient()

const APPLY = process.argv.includes("--apply")
const projectArgIdx = process.argv.indexOf("--project")
const ONLY_PROJECT = projectArgIdx !== -1 ? process.argv[projectArgIdx + 1] : null

/** Bug statuses that count as "still open against this case". */
const OPEN_BUG_STATUSES = ["Open", "InProgress", "ReadyForRetest", "Reopened"] as const

/** TestRunStatus / StepStatus → case-level verdict. Non-terminal → null. */
function toCaseStatus(raw: string): TestCaseStatus | null {
  switch (raw) {
    case "Passed":
      return "Passed"
    case "Failed":
      return "Failed"
    case "Blocked":
      return "Blocked"
    case "Warning":
      return "Warning"
    case "Skipped":
      return "Skipped"
    case "SelfHealed":
      // A self-healed step still passed its assertion.
      return "Passed"
    default:
      // Queued / Running / Pending / Cancelled — never a settled verdict.
      return null
  }
}

async function backfillSuites(projectId: string) {
  const [epics, features, cases] = await Promise.all([
    prisma.epic.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" } }),
    prisma.feature.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" } }),
    prisma.testCase.findMany({
      where: { projectId, suiteId: null },
      select: {
        id: true,
        requirements: {
          select: { requirement: { select: { featureId: true, epicId: true } } },
          take: 1,
        },
      },
    }),
  ])

  // name → suite id, so a re-run reuses suites instead of duplicating them.
  const existing = await prisma.testSuite.findMany({ where: { projectId } })
  const byName = new Map<string, string>(existing.map((s) => [s.name, s.id]))

  const epicSuiteId = new Map<string, string>()
  const featureSuiteId = new Map<string, string>()

  let suitesCreated = 0

  /**
   * Returns the suite id for `name`, creating it when --apply is set.
   *
   * On a dry run it hands back a synthetic id instead of undefined, so the
   * epic/feature maps still populate and the reported "cases filed" count is
   * the number the real run will produce. Without this the preview always
   * reported zero, which made it useless for deciding whether to apply.
   */
  async function ensureSuite(
    name: string,
    data: { parentId: string | null; orderIndex: number; description: string | null }
  ): Promise<string> {
    const found = byName.get(name)
    if (found) return found

    suitesCreated++
    if (!APPLY) {
      const planned = `planned:${name}`
      byName.set(name, planned)
      return planned
    }
    const created = await prisma.testSuite.create({
      data: { projectId, name, ...data },
    })
    byName.set(name, created.id)
    return created.id
  }

  for (const [i, epic] of epics.entries()) {
    const id = await ensureSuite(`${epic.epicKey} — ${epic.title}`, {
      parentId: null,
      orderIndex: epic.orderIndex ?? i,
      description: epic.description,
    })
    epicSuiteId.set(epic.id, id)
  }

  for (const [i, feature] of features.entries()) {
    const parentId = feature.epicId ? epicSuiteId.get(feature.epicId) ?? null : null
    const id = await ensureSuite(`${feature.featureKey} — ${feature.name}`, {
      // A planned parent id only exists on a dry run, where nothing is written.
      parentId: parentId?.startsWith("planned:") ? null : parentId,
      orderIndex: feature.orderIndex ?? i,
      description: feature.description,
    })
    featureSuiteId.set(feature.id, id)
  }

  let filed = 0
  let unfiled = 0

  for (const tc of cases) {
    const req = tc.requirements[0]?.requirement
    const target = req?.featureId
      ? featureSuiteId.get(req.featureId)
      : req?.epicId
        ? epicSuiteId.get(req.epicId)
        : undefined

    if (!target) {
      unfiled++
      continue
    }
    // A "planned:" id only occurs on a dry run, where nothing is written.
    if (APPLY && !target.startsWith("planned:")) {
      await prisma.testCase.update({ where: { id: tc.id }, data: { suiteId: target } })
    }
    filed++
  }

  return { suitesCreated, filed, unfiled }
}

async function backfillRollup(projectId: string) {
  const cases = await prisma.testCase.findMany({ where: { projectId }, select: { id: true } })
  const ids = cases.map((c) => c.id)
  if (ids.length === 0) return { updated: 0, withStatus: 0, withBugs: 0 }

  // Latest settled automated run per case.
  const runs = await prisma.testRun.findMany({
    where: { projectId, testCaseId: { in: ids }, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { id: true, testCaseId: true, status: true, completedAt: true },
  })
  const latestAuto = new Map<string, (typeof runs)[number]>()
  for (const r of runs) {
    if (r.testCaseId && !latestAuto.has(r.testCaseId)) latestAuto.set(r.testCaseId, r)
  }

  // Latest settled manual result per case.
  const manual = await prisma.manualSessionCase.findMany({
    where: { testCaseId: { in: ids }, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { id: true, testCaseId: true, status: true, completedAt: true },
  })
  const latestManual = new Map<string, (typeof manual)[number]>()
  for (const m of manual) {
    if (!latestManual.has(m.testCaseId)) latestManual.set(m.testCaseId, m)
  }

  // Open bug counts.
  const bugGroups = await prisma.bugReport.groupBy({
    by: ["testCaseId"],
    where: { testCaseId: { in: ids }, status: { in: [...OPEN_BUG_STATUSES] as any } },
    _count: { _all: true },
  })
  const openBugs = new Map(bugGroups.map((g) => [g.testCaseId!, g._count._all]))

  let updated = 0
  let withStatus = 0
  let withBugs = 0

  for (const id of ids) {
    const auto = latestAuto.get(id)
    const man = latestManual.get(id)

    // Later completedAt wins; fall back to whichever exists.
    let winner: { status: string; at: Date; runId: string; source: ExecutionType } | null = null
    if (auto?.completedAt && man?.completedAt) {
      winner =
        auto.completedAt >= man.completedAt
          ? { status: auto.status, at: auto.completedAt, runId: auto.id, source: "Automated" }
          : { status: man.status, at: man.completedAt, runId: man.id, source: "Manual" }
    } else if (auto?.completedAt) {
      winner = { status: auto.status, at: auto.completedAt, runId: auto.id, source: "Automated" }
    } else if (man?.completedAt) {
      winner = { status: man.status, at: man.completedAt, runId: man.id, source: "Manual" }
    }

    const mapped = winner ? toCaseStatus(winner.status) : null
    const bugCount = openBugs.get(id) ?? 0

    if (mapped) withStatus++
    if (bugCount > 0) withBugs++

    if (APPLY) {
      await prisma.testCase.update({
        where: { id },
        data: {
          lastStatus: mapped ?? "NotExecuted",
          lastRunAt: mapped && winner ? winner.at : null,
          lastRunId: mapped && winner ? winner.runId : null,
          lastRunSource: mapped && winner ? winner.source : null,
          openBugCount: bugCount,
        },
      })
    }
    updated++
  }

  return { updated, withStatus, withBugs }
}

async function main() {
  const projects = await prisma.project.findMany({
    where: ONLY_PROJECT ? { id: ONLY_PROJECT } : {},
    select: { id: true, name: true },
  })

  if (projects.length === 0) {
    console.log("No matching projects.")
    return
  }

  console.log(APPLY ? "APPLYING changes\n" : "DRY RUN — nothing will be written. Re-run with --apply.\n")

  for (const p of projects) {
    const suites = await backfillSuites(p.id)
    const rollup = await backfillRollup(p.id)
    console.log(
      `${p.name} (${p.id})\n` +
        `   suites created : ${suites.suitesCreated}\n` +
        `   cases filed    : ${suites.filed}\n` +
        `   left unfiled   : ${suites.unfiled}\n` +
        `   rollup written : ${rollup.updated} (${rollup.withStatus} with a verdict, ${rollup.withBugs} with open bugs)\n`
    )
  }

  if (!APPLY) console.log("Dry run complete. Re-run with --apply to write.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
