/**
 * POST /api/projects/[projectId]/integrations/openproject/groups/[groupId]/map-parent
 *
 * Maps an OpenProject parent work package to a module group.
 * Validates the parent belongs to the configured project.
 */
import { NextRequest, NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { mapGroupParent } from "@/lib/integrations/openproject/openproject-group-sync"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; groupId: string } }
) {
  try {
    const auth = await requireProjectMember(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const body = await request.json().catch(() => ({}))
    const { parentWorkPackageId } = body as { parentWorkPackageId?: string }

    if (!parentWorkPackageId?.trim()) {
      return NextResponse.json({ error: "parentWorkPackageId is required" }, { status: 400 })
    }

    const result = await mapGroupParent(params.projectId, params.groupId, parentWorkPackageId.trim())

    return NextResponse.json({
      success: true,
      parentId: parentWorkPackageId,
      parentSubject: result.subject,
      parentUrl: result.url,
      message: `Parent WP #${parentWorkPackageId} mapped successfully`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to map parent" }, { status: 500 })
  }
}
