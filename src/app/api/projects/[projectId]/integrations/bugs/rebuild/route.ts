/**
 * Rebuild the connected tracker's bug list from the app's bugs.
 *
 * GET  → the plan: what would be imported, deleted and re-synced. Reads only.
 * POST → run it. Requires { confirm: true } in the body, because every bug work
 *        item in the tracker project is permanently deleted — trackers have no
 *        undo. Bugs that exist only in the tracker are imported into the app
 *        before their work item is destroyed.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { planBugRebuild, rebuildTrackerBugs } from "@/lib/integrations/core/rebuild-bugs"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    return NextResponse.json(await planBugRebuild(params.projectId))
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not read the tracker" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  if (body?.confirm !== true) {
    return badRequestResponse(
      "This permanently deletes every bug work item in the tracker project. Send { confirm: true } to proceed."
    )
  }

  try {
    return NextResponse.json(await rebuildTrackerBugs(params.projectId))
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Tracker rebuild failed" }, { status: 500 })
  }
}
