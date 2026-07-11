import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import { OVERRIDE_KEYS } from "@/lib/permissions"

// GET /api/projects/[projectId]/membership — the caller's global role, project
// role, and raw per-member overrides. Consumed by the sidebar to hydrate the
// client permission store when the active project changes.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const resolved = await resolveProjectRole(params.projectId, session.user.id)
  if (!resolved || resolved.role === null) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 })
  }

  // Surface the raw overrides map (nulls included) so the client resolver can
  // apply them on top of role defaults.
  const overrides: Record<string, boolean | null> = {}
  for (const k of OVERRIDE_KEYS) overrides[k] = resolved.overrides[k] ?? null

  return NextResponse.json({
    globalRole: resolved.globalRole,
    role: resolved.role,
    overrides,
    permissions: resolved.permissions,
  })
}
