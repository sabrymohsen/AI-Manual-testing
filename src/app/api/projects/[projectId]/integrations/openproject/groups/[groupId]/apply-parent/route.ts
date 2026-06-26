/**
 * POST /api/projects/[projectId]/integrations/openproject/groups/[groupId]/apply-parent
 *
 * Applies the group's mapped parent to all already-synced test case WPs in this group.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { applyParentToGroup } from "@/lib/integrations/openproject/openproject-group-sync"

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectOwner(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const result = await applyParentToGroup(params.projectId, params.groupId)

    return NextResponse.json({
      ...result,
      message: `Parent linked: ${result.linked} · Already linked: ${result.alreadyLinked} · Failed: ${result.failed}`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Apply parent failed" }, { status: 500 })
  }
}
