/**
 * One-off: run the board-diagnostics logic outside the HTTP route (no session
 * cookie needed) for a given board id.
 *
 *   npx tsx scripts/diagnose-board.ts 334 [projectId]
 *
 * Without a projectId it tries every project that has an OpenProject
 * integration and reports the first one where the board resolves.
 */
import { PrismaClient } from "@prisma/client"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

const prisma = new PrismaClient()

const boardId = process.argv[2] || "334"
const wantedProjectId = process.argv[3] || null

async function diagnose(projectId: string, projectName: string) {
  const resolved = await resolveOpenProject(projectId)
  if (!resolved.ok) {
    console.log(`  ✗ ${projectName}: ${resolved.error}`)
    return false
  }
  const { client } = resolved

  let columns
  try {
    columns = await client.getBoardColumns(Number(boardId))
  } catch (err: any) {
    console.log(`  ✗ ${projectName}: could not read board ${boardId} — ${err?.message}`)
    return false
  }
  if (!columns.length) {
    console.log(`  ✗ ${projectName}: board ${boardId} has no columns (wrong board id for this project?)`)
    return false
  }

  console.log(`\n=== Project: ${projectName} (${projectId}) — board ${boardId} ===`)
  const appearances = new Map<string, string[]>()

  for (const col of columns) {
    const queryIds = col.queryId ? await client.getQueryResultIds(col.queryId) : []
    const filterIds = await client.getBoardWidgetIds(Number(boardId), col.widgetId)
    const onlyInQuery = queryIds.filter((id) => !filterIds.includes(id))
    const onlyInFilter = filterIds.filter((id) => !queryIds.includes(id))

    console.log(`\n  Column "${col.name}"  [type=${col.columnType} widgetId=${col.widgetId} queryId=${col.queryId}]`)
    console.log(`    filterIds (app pinned) : ${filterIds.join(", ") || "(none)"}`)
    console.log(`    queryIds  (OP query)   : ${queryIds.join(", ") || "(none)"}`)
    if (onlyInQuery.length) console.log(`    ⚠ only in query  (moved in OP)  : ${onlyInQuery.join(", ")}`)
    if (onlyInFilter.length) console.log(`    ⚠ only in filter (app pinning)  : ${onlyInFilter.join(", ")}`)

    for (const id of new Set([...filterIds, ...queryIds])) {
      appearances.set(id, [...(appearances.get(id) || []), col.name])
    }
  }

  const duplicates = [...appearances.entries()].filter(([, cols]) => cols.length > 1)
  console.log(`\n  --- Cards rendering in more than one column: ${duplicates.length} ---`)
  for (const [wpId, cols] of duplicates) {
    console.log(`    WP #${wpId} appears in: ${cols.join(" + ")}`)
  }

  // Cross-reference the app's own mapping rows so we can see what the app
  // THINKS the placement is versus what the board actually shows.
  const mappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, localEntityType: "BugReport" },
    select: {
      externalId: true,
      localEntityId: true,
      placementColumnId: true,
      lastSyncStatus: true,
      lastSyncError: true,
      updatedAt: true,
    },
  })
  const onBoard = new Set(appearances.keys())
  const relevant = mappings.filter((m) => onBoard.has(String(m.externalId)))
  console.log(`\n  --- App-side mappings for cards on this board: ${relevant.length} ---`)
  for (const m of relevant) {
    const actual = appearances.get(String(m.externalId)) || []
    console.log(
      `    WP #${m.externalId}  app.placementColumnId=${m.placementColumnId ?? "null"}  ` +
        `actual=[${actual.join(" + ")}]  sync=${m.lastSyncStatus}${m.lastSyncError ? ` (${m.lastSyncError})` : ""}`
    )
  }

  const stuck = mappings.filter((m) => !m.externalId)
  if (stuck.length) {
    console.log(`\n  ⚠ ${stuck.length} mapping row(s) claimed with NO externalId (blocks retries for 5 min):`)
    for (const m of stuck) console.log(`    bug=${m.localEntityId} claimedAt=${m.updatedAt.toISOString()}`)
  }

  return true
}

async function main() {
  const projects = wantedProjectId
    ? await prisma.project.findMany({ where: { id: wantedProjectId }, select: { id: true, name: true } })
    : await prisma.project.findMany({ select: { id: true, name: true } })

  console.log(`Checking board ${boardId} across ${projects.length} project(s)…\n`)
  let found = false
  for (const p of projects) {
    if (await diagnose(p.id, p.name)) found = true
  }
  if (!found) console.log(`\nBoard ${boardId} did not resolve for any project.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
