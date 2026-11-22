/**
 * Gives bugs saved without a project (or without a BUG-xxxx key) their project
 * and key.
 *
 *   npx tsx scripts/backfill-bug-projects.ts           # dry run, reports only
 *   npx tsx scripts/backfill-bug-projects.ts --apply   # writes
 *
 * Bugs filed from a manual test run were created without projectId, so they
 * could not be opened, edited or deleted, and never showed in a project's list.
 * The project is read from what the bug is linked to (manual run, test run,
 * test case, module, recording); a bug linked to nothing is reported and left
 * alone. Idempotent: only touches bugs whose projectId or bugKey is missing.
 */
import { prisma } from "../src/lib/db"
import { inferBugProjectId, nextBugKey } from "../src/lib/bug-reports/keys"

const APPLY = process.argv.includes("--apply")

async function main() {
  const bugs = await prisma.bugReport.findMany({
    where: { OR: [{ projectId: null }, { bugKey: null }] },
    select: { id: true, projectId: true, bugKey: true, title: true },
    orderBy: { createdAt: "asc" },
  })
  console.log(`${bugs.length} bug(s) without a project or key${APPLY ? "" : " (dry run — add --apply to write)"}`)
  let fixed = 0
  let stuck = 0
  for (const b of bugs) {
    const projectId = b.projectId ?? (await inferBugProjectId(b.id))
    if (!projectId) {
      stuck++
      console.log(`  ! ${b.id} "${b.title.slice(0, 60)}": linked to nothing that has a project; left alone`)
      continue
    }
    const bugKey = b.bugKey ?? (await nextBugKey(projectId))
    console.log(`  ${APPLY ? "✓" : "→"} ${b.id} → project ${projectId}, key ${bugKey}`)
    if (APPLY) {
      await prisma.bugReport.update({ where: { id: b.id }, data: { projectId, bugKey } })
      fixed++
    }
  }
  console.log(APPLY ? `Fixed ${fixed}, could not place ${stuck}.` : `Would fix ${bugs.length - stuck}, could not place ${stuck}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
