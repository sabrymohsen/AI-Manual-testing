/**
 * Backfill for 20260826100000_bug_module_link.
 *
 *   npx tsx scripts/backfill-bug-suites.ts                     # dry run, reports only
 *   npx tsx scripts/backfill-bug-suites.ts --apply             # writes
 *   npx tsx scripts/backfill-bug-suites.ts --apply --project <projectId>
 *
 * Files each existing bug under the module (TestSuite) of its linked test case.
 * Idempotent and conservative:
 *
 *   - only touches bugs whose suiteId is still NULL, so a module set by hand is
 *     never overwritten, and re-running changes nothing;
 *   - only bugs that HAVE a linked test case, and only when that case is itself
 *     filed under a suite — a bug with no case stays Unfiled, which is the
 *     honest answer rather than a guess;
 *   - skips a case whose suite belongs to a different project than the bug,
 *     which can only mean data has been moved between projects.
 *
 * Bugs filed after the migration get their module from the create middleware in
 * src/lib/db; this script is only for the ones that already existed.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const APPLY = process.argv.includes("--apply")
const projectArgIdx = process.argv.indexOf("--project")
const ONLY_PROJECT = projectArgIdx !== -1 ? process.argv[projectArgIdx + 1] : null

async function main() {
  console.log(APPLY ? "Mode: APPLY (writing)" : "Mode: DRY RUN (no writes)")
  if (ONLY_PROJECT) console.log(`Scoped to project ${ONLY_PROJECT}`)

  const bugs = await prisma.bugReport.findMany({
    where: {
      suiteId: null,
      testCaseId: { not: null },
      ...(ONLY_PROJECT ? { projectId: ONLY_PROJECT } : {})
    },
    select: {
      id: true,
      bugKey: true,
      projectId: true,
      testCase: {
        select: {
          id: true,
          projectId: true,
          suiteId: true,
          suite: { select: { id: true, name: true, projectId: true } }
        }
      }
    }
  })

  console.log(`${bugs.length} unfiled bug(s) with a linked test case.`)

  const byModule = new Map<string, number>()
  const updates: Array<{ id: string; suiteId: string }> = []
  let noSuite = 0
  let crossProject = 0

  for (const bug of bugs) {
    const suite = bug.testCase?.suite
    if (!suite) {
      noSuite++
      continue
    }
    if (bug.projectId && suite.projectId !== bug.projectId) {
      crossProject++
      console.warn(
        `  ! ${bug.bugKey || bug.id}: linked case's suite "${suite.name}" is in another project — skipped`
      )
      continue
    }
    updates.push({ id: bug.id, suiteId: suite.id })
    byModule.set(suite.name, (byModule.get(suite.name) || 0) + 1)
  }

  console.log(`\nWould file ${updates.length} bug(s):`)
  for (const [name, count] of [...byModule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${name}`)
  }
  if (noSuite) console.log(`\n${noSuite} skipped — their linked case is itself unfiled.`)
  if (crossProject) console.log(`${crossProject} skipped — cross-project suite.`)

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.")
    return
  }

  // Grouped by suite so the whole backfill is a handful of updateMany calls
  // rather than one round-trip per bug.
  const bySuite = new Map<string, string[]>()
  for (const u of updates) {
    if (!bySuite.has(u.suiteId)) bySuite.set(u.suiteId, [])
    bySuite.get(u.suiteId)!.push(u.id)
  }

  let written = 0
  for (const [suiteId, ids] of bySuite) {
    const res = await prisma.bugReport.updateMany({
      // suiteId still null in the WHERE, so a bug filed by hand between the dry
      // run and the apply keeps the human's answer.
      where: { id: { in: ids }, suiteId: null },
      data: { suiteId }
    })
    written += res.count
  }

  console.log(`\nDone. ${written} bug(s) filed under their case's module.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
