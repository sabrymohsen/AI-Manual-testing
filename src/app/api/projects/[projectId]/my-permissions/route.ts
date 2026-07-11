import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"

// GET /api/projects/[projectId]/my-permissions — the caller's global role,
// project role, and flat permission map for this project. Used to hydrate the
// client permission store when the active project changes.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const resolved = await resolveProjectRole(params.projectId, session.user.id)
  if (!resolved || resolved.role === null) {
    return NextResponse.json({ error: "Not a project member" }, { status: 404 })
  }

  return NextResponse.json({
    projectId: params.projectId,
    globalRole: resolved.globalRole,
    projectRole: resolved.role,
    isCreator: resolved.isCreator,
    permissions: resolved.permissions,
  })
}
