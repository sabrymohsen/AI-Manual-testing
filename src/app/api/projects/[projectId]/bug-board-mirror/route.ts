/**
 * GET /api/projects/[projectId]/bug-board-mirror
 *
 * The connected tracker's board, described so the app's Bug Reports board can
 * render the same columns in the same order — plus which column each bug sits
 * in according to the tracker itself.
 *
 * Read-only and safe to call on every board render: it costs one status read,
 * one board-column read and one indexed query over ExternalSyncMapping. When no
 * integration is configured (or the tracker is unreachable) it returns
 * `available: false` and the UI falls back to the app's own status columns, so
 * the board is never blank because a third party is down.
 *
 * Member-level, not owner: looking at the board is not an administrative act.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { getBoardMirror } from "@/lib/integrations/core/board-mirror"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const bugs = await prisma.bugReport.findMany({
      where: { projectId: params.projectId },
      select: { id: true, status: true },
    })

    const mirror = await getBoardMirror(params.projectId, bugs)
    return NextResponse.json(mirror)
  } catch (err: any) {
    // A tracker failure must not take the board down — report it as "no mirror".
    return NextResponse.json({
      available: false,
      provider: null,
      trackerName: null,
      boardId: null,
      boardName: null,
      boardUrl: null,
      columns: [],
      placement: {},
      links: {},
      unsyncedBugIds: [],
      error: err?.message || "Could not read the tracker board",
    })
  }
}
