/**
 * GET /api/projects/[projectId]/integrations/openproject/groups/[groupId]/items
 *
 * Returns all test cases in the group with their OpenProject sync status.
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { getGroupSyncedItems } from "@/lib/integrations/openproject/openproject-group-sync"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectMember(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const result = await getGroupSyncedItems(params.projectId, params.groupId)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load group items" }, { status: 500 })
  }
}
