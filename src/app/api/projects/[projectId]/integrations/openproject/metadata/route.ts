/**
 * GET /api/projects/[projectId]/integrations/openproject/metadata
 *
 * Dynamic metadata loader — returns types, statuses, versions from the connected OpenProject instance.
 */
import { NextResponse } from "next/server"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  // Member-level: the bug form's board picker reads this. Owner-only meant
  // testers saw an empty board list.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { client } = resolved

  try {
    const [types, statuses, versions, boards] = await Promise.allSettled([
      client.getTypes(),
      client.getStatuses(),
      client.getVersions(),
      client.getBoards(),
    ])

    return NextResponse.json({
      types: types.status === "fulfilled" ? types.value : [],
      statuses: statuses.status === "fulfilled" ? statuses.value : [],
      versions: versions.status === "fulfilled" ? versions.value : [],
      boards: boards.status === "fulfilled" ? boards.value : [],
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load metadata" },
      { status: 500 }
    )
  }
}
