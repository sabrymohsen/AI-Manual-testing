import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

// GET /api/invitations/[token] — public preview of an invitation so the
// accept page can show the project name / inviter before the user acts.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const invitation = await prisma.invitation.findUnique({
    where: { token: params.token },
    include: {
      project: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  })
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 })

  const expired = invitation.expiresAt.getTime() < Date.now()
  const status = invitation.status === "PENDING" && expired ? "EXPIRED" : invitation.status

  return NextResponse.json({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      status,
      projectName: invitation.project.name,
      invitedBy: invitation.invitedBy?.name || invitation.invitedBy?.email || "A teammate",
      expiresAt: invitation.expiresAt,
    },
  })
}
