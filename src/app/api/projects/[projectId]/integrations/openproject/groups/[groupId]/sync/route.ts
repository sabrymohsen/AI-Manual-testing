/**
 * POST /api/projects/[projectId]/integrations/openproject/groups/[groupId]/sync
 *
 * Syncs only the test cases in the specified group/module to OpenProject.
 * Uses the group's parent mapping if set. Creates OpenProjectSyncRun for tracking.
 * After syncing WPs, automatically applies board/version visibility so items appear on the board.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import {
  syncGroupTestCasesToOpenProject,
  syncGroupToBoard,
} from "@/lib/integrations/openproject/openproject-group-sync"

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectOwner(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const result = await syncGroupTestCasesToOpenProject(params.projectId, params.groupId)

    // After syncing, apply board/version/type visibility so WPs appear on the configured board.
    // Errors are non-fatal — if board sync fails the WPs are still synced.
    let boardResult: { updated: number; failed: number; total: number } | null = null
    try {
      boardResult = await syncGroupToBoard(params.projectId, params.groupId)
    } catch {
      // Ignore — board sync failure doesn't invalidate the main sync
    }

    const message = [
      result.created > 0 ? `Created: ${result.created}` : "",
      result.updated > 0 ? `Updated: ${result.updated}` : "",
      result.failed > 0 ? `Failed: ${result.failed}` : "",
      result.parentLinked > 0 ? `Parent linked: ${result.parentLinked}` : "",
      boardResult && boardResult.updated > 0 ? `Board applied: ${boardResult.updated}` : "",
    ].filter(Boolean).join(" · ")

    return NextResponse.json({
      ...result,
      boardResult,
      message: message || "No changes",
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 })
  }
}
