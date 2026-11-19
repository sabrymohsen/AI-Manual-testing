/**
 * GET /api/projects/[projectId]/integrations/openproject/groups/[groupId]/status
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { getGroupSyncStatus } from "@/lib/integrations/openproject/openproject-group-sync"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectMember(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const group = await getGroupSyncStatus(params.projectId, params.groupId)
    return NextResponse.json({ group })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to get group status" }, { status: 500 })
  }
}
