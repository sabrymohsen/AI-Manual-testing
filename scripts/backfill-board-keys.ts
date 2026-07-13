// Backfills Project.boardKey for projects created before keys were derived
// at creation time (their scrum task ids rendered as "TASK-n"). Safe to
// re-run; only touches rows with a null/empty key. Respects DATABASE_URL.
//
//   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-board-keys.ts
import { PrismaClient } from "@prisma/client"
import { deriveBoardKey } from "../src/lib/board-key"

const prisma = new PrismaClient()

async function main() {
  const projects = await prisma.project.findMany({
    where: { OR: [{ boardKey: null }, { boardKey: "" }] },
    select: { id: true, name: true },
  })
  if (projects.length === 0) {
    console.log("All projects already have a boardKey — nothing to do.")
    return
  }
  for (const p of projects) {
    const boardKey = deriveBoardKey(p.name)
    await prisma.project.update({ where: { id: p.id }, data: { boardKey } })
    console.log(`${p.name} → ${boardKey}`)
  }
  console.log(`Backfilled ${projects.length} project(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
