import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { syncProjectTeam } from "@/lib/team/sync-team"

/**
 * POST /api/projects/:projectId/team/sync
 * Pulls the connected management tool's users via the unified provider
 * getMembers() and upserts them into the assignee pool. Preserves any
 * app-assigned role on re-sync, and deactivates previously-synced members that
 * the tool no longer returns (manual members are never touched).
 */
export async function POST(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const result = await syncProjectTeam(params.projectId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const all = await prisma.projectTeamMember.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  })
  return NextResponse.json({ synced: result.synced, provider: result.provider, members: all })
}
