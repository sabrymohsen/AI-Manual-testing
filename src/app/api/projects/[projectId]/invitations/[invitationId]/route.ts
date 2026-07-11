import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission } from "@/lib/api-guards"

// DELETE /api/projects/[projectId]/invitations/[invitationId] — cancel a
// pending invitation (requires canInviteMembers).
export async function DELETE(
  _req: Request,
  { params }: { params: { projectId: string; invitationId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canInviteMembers")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const invitation = await prisma.invitation.findUnique({
    where: { id: params.invitationId },
    select: { id: true, projectId: true },
  })
  if (!invitation || invitation.projectId !== params.projectId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }

  await prisma.invitation.delete({ where: { id: params.invitationId } })
  return NextResponse.json({ success: true })
}
