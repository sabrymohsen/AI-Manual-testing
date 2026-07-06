/**
 * Restore requirements deleted from a project by re-creating them from a
 * RequirementImport's stored parsedItems (the parsed spreadsheet rows).
 *
 * Dry-run by default — prints what it would do. Pass --commit to write.
 * Idempotent: upserts by (projectId, requirementKey).
 *
 *   npx tsx scripts/restore-requirements-from-import.ts            # dry run
 *   npx tsx scripts/restore-requirements-from-import.ts --commit   # apply
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const PROJECT_ID = "edbf4c22-752f-4136-a13d-9f309a5bb33e" // SDOH
const IMPORT_ID = "8d8499b1-bd14-422e-abb1-dac3950703a8" // SDOH_Emergency_Maintenance_Test_Cases.xlsx
const EXPECTED_COUNT = 139

function normalizePriority(raw: unknown): "Low" | "Medium" | "High" | "Critical" {
  const v = String(raw ?? "").trim().toLowerCase()
  if (/critical|urgent|highest|p0|p1/.test(v)) return "Critical"
  if (/high|p2/.test(v)) return "High"
  if (/low|minor|p4|p5/.test(v)) return "Low"
  return "Medium"
}

async function main() {
  const commit = process.argv.includes("--commit")

  const imp = await prisma.requirementImport.findUnique({
    where: { id: IMPORT_ID },
    select: { projectId: true, fileName: true, parsedItems: true },
  })
  if (!imp || imp.projectId !== PROJECT_ID) throw new Error("Import record not found for project")

  const items = imp.parsedItems as Array<{
    requirementKey?: string
    title?: string
    priority?: string
  }>
  if (!Array.isArray(items) || items.length === 0) throw new Error("No parsedItems on import")

  const before = await prisma.requirement.count({ where: { projectId: PROJECT_ID } })
  console.log(`Source: ${imp.fileName} — ${items.length} parsed rows`)
  console.log(`Requirements in project before: ${before}`)
  console.log(commit ? "MODE: COMMIT" : "MODE: DRY RUN (pass --commit to apply)")
  console.log("---")

  let created = 0
  let updated = 0
  const skippedRows: string[] = []

  for (const item of items) {
    if (!item.requirementKey || !item.title) {
      skippedRows.push(JSON.stringify(item).slice(0, 120))
      continue
    }
    // Mirror how save-generated originally created these rows on Jul 3
    const data = {
      title: item.title.substring(0, 200),
      priority: normalizePriority(item.priority),
      status: "ReadyForTesting" as const,
      source: "AIGenerated" as const,
      sourceImportId: IMPORT_ID,
    }
    const existing = await prisma.requirement.findUnique({
      where: {
        projectId_requirementKey: {
          projectId: PROJECT_ID,
          requirementKey: item.requirementKey,
        },
      },
    })
    if (existing) {
      if (commit) await prisma.requirement.update({ where: { id: existing.id }, data })
      updated++
    } else {
      if (commit) {
        await prisma.requirement.create({
          data: { projectId: PROJECT_ID, requirementKey: item.requirementKey, ...data },
        })
      }
      created++
    }
  }

  console.log(`create: ${created}, update: ${updated}, skipped: ${skippedRows.length}`)
  if (skippedRows.length > 0) {
    console.log("Skipped rows (missing key/title):")
    skippedRows.forEach((r) => console.log("  -", r))
  }

  const after = await prisma.requirement.count({ where: { projectId: PROJECT_ID } })
  if (commit) {
    console.log(`Requirements in project after: ${after}`)
    if (after === EXPECTED_COUNT) console.log(`✓ Count verified: ${EXPECTED_COUNT}`)
    else console.warn(`⚠ Expected ${EXPECTED_COUNT}, got ${after} — investigate`)
  } else {
    console.log(`Dry run — count would become: ${before + created}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
