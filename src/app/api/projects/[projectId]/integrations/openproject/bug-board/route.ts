/**
 * GET  → the tracker's statuses and the columns that would be created from
 *        them, plus a suggested app-status mapping. Reads only.
 * POST → create the bug board and (unless setAsDefault:false) point this
 *        project's bug sync at it.
 *
 * Body: { name?: string, setAsDefault?: boolean, statusIds?: string[] }
 *   statusIds — which tracker statuses get a column. Omitted means all of them,
 *   which is the default precisely so no bug can reach a status with no column
 *   and drop off the board.
 *
 * Provider-neutral despite the URL: the path is kept for back-compat, but the
 * work goes through loadIntegration, so a project on Jira or Azure DevOps is
 * served by the same code.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { loadIntegration } from "@/lib/integrations/core/load-integration"
import {
  createBugWorkflowBoard,
  planBugBoardColumns,
  resolveBugType,
} from "@/lib/integrations/core/create-bug-board"
import {
  readBugStatusMapping,
  suggestBugStatusMapping,
} from "@/lib/integrations/core/bug-status-mapping"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const loaded = await loadIntegration(params.projectId)
  if (!loaded) {
    return NextResponse.json(
      { error: "No project-management integration is configured for this project" },
      { status: 400 }
    )
  }

  try {
    const provider = loaded.getClient()
    const statuses = await provider.getStatuses()
    const bugType = await resolveBugType(params.projectId, provider)

    const stored = readBugStatusMapping(loaded.statusMapping)
    const hasStored = Object.keys(stored).length > 0

    return NextResponse.json({
      provider: loaded.provider,
      canCreateBoard: !!provider.createStatusBoard,
      trackerStatuses: statuses.map((s) => ({ id: String(s.id), name: s.name })),
      // Every status is a column by default — that is what stops a bug from
      // reaching a status the board cannot show.
      columns: planBugBoardColumns(statuses),
      bugTypeName: bugType?.name || null,
      /** What the user saved, or a first guess when they have saved nothing. */
      bugStatusMapping: hasStored ? stored : suggestBugStatusMapping(statuses),
      bugStatusMappingIsSuggestion: !hasStored,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not read the tracker's statuses" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  const statusIds = Array.isArray(body?.statusIds)
    ? body.statusIds.map(String).filter(Boolean)
    : undefined

  try {
    const result = await createBugWorkflowBoard(params.projectId, {
      name: typeof body?.name === "string" ? body.name : undefined,
      setAsDefault: body?.setAsDefault !== false,
      statusIds,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not create the board" }, { status: 500 })
  }
}
