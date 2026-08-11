/**
 * GET /api/projects/[projectId]/integrations/openproject/members
 *
 * Returns the assignable users (project members) of the connected OpenProject
 * instance, so bugs can be assigned to a real member.
 */
import { NextResponse } from "next/server"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  // Member-level: anyone who can file a bug needs the assignee list. Under
  // requireProjectOwner this 404'd for ordinary testers, leaving them an empty
  // "Assign To" dropdown.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  try {
    const members = await resolved.client.getMembers()
    return NextResponse.json({ members })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load members" },
      { status: 500 }
    )
  }
}
