/**
 * GET /api/projects/[projectId]/integrations/openproject/board-diagnostics?boardId=N
 *
 * Read-only. Reports, per board column, the two sources of truth that decide
 * where a card renders:
 *
 *   filterIds — the explicit id filter this app writes into the grid widget
 *   queryIds  — what the column's own OpenProject query returns, which is what
 *               the board UI updates when someone drags a card
 *
 * When those disagree, the same work package renders in two columns at once —
 * one card in each — which reads as a duplicate that won't move. `duplicates`
 * names exactly which ids are in that state and where they appear, so the fix
 * can be aimed at the right side instead of guessed at.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { client, integration } = resolved

  const { searchParams } = new URL(request.url)
  const boardId = searchParams.get("boardId") || (integration as any)?.targetBoardId || null
  if (!boardId) {
    return badRequestResponse("boardId is required (no default board is configured for this project)")
  }

  try {
    const columns = await client.getBoardColumns(Number(boardId))

    const detail = await Promise.all(
      columns.map(async (col) => {
        const queryIds = col.queryId ? await client.getQueryResultIds(col.queryId) : []
        const filterIds = await client.getBoardWidgetIds(Number(boardId), col.widgetId)
        return {
          widgetId: col.widgetId,
          name: col.name,
          columnType: col.columnType,
          queryId: col.queryId,
          filterIds,
          queryIds,
          /** In the query but not in our filter — i.e. moved here in OpenProject. */
          onlyInQuery: queryIds.filter((id) => !filterIds.includes(id)),
          /** In our filter but not in the query — i.e. we are pinning it here. */
          onlyInFilter: filterIds.filter((id) => !queryIds.includes(id)),
        }
      })
    )

    // A work package that renders in more than one column, from either source.
    const appearances = new Map<string, string[]>()
    for (const col of detail) {
      for (const id of new Set([...col.filterIds, ...col.queryIds])) {
        appearances.set(id, [...(appearances.get(id) || []), col.name])
      }
    }
    const duplicates = [...appearances.entries()]
      .filter(([, cols]) => cols.length > 1)
      .map(([workPackageId, inColumns]) => ({ workPackageId, inColumns }))

    return NextResponse.json({ boardId: String(boardId), columns: detail, duplicates })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not read the board" }, { status: 500 })
  }
}
