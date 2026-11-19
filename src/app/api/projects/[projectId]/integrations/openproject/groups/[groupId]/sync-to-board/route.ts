/**
 * POST /api/projects/[projectId]/integrations/openproject/groups/[groupId]/sync-to-board
 *
 * Applies board visibility fields (type, status, parent, version, assignee) to
 * all synced test case WPs in this group.
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { syncGroupToBoard } from "@/lib/integrations/openproject/openproject-group-sync"

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectMember(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const result = await syncGroupToBoard(params.projectId, params.groupId)

    const boardPlaced = result.boardPlaced
    const boardPermissionDenied = result.boardPermissionDenied

    let message = `Processed: ${result.total}`
    if (boardPlaced > 0) message += ` · Board column configured (${boardPlaced} WPs visible)`
    if (result.failed > 0) message += ` · Failed: ${result.failed}`

    let error: string | undefined
    if (boardPermissionDenied && !boardPlaced) {
      error = result.firstError || "Could not configure board column. Ensure the group has been synced first so a parent WP exists."
    } else if (result.failed > 0) {
      error = result.firstError || "Unknown error on WP update"
    }

    return NextResponse.json({ ...result, message, error })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync to board failed" }, { status: 500 })
  }
}
