/**
 * POST /api/projects/[projectId]/integrations/openproject/groups/[groupId]/check-board-visibility
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { checkGroupBoardVisibility } from "@/lib/integrations/openproject/openproject-group-sync"

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectOwner(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const result = await checkGroupBoardVisibility(params.projectId, params.groupId)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Board visibility check failed" }, { status: 500 })
  }
}
