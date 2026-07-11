import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission } from "@/lib/api-guards"

// GET /api/projects/[projectId]/invitations — list invitations (requires
// canInviteMembers). Expired PENDING invitations are surfaced as EXPIRED.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canInviteMembers")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const invitations = await prisma.invitation.findMany({
    where: { projectId: params.projectId },
    include: { invitedBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  })

  const now = Date.now()
  const withStatus = invitations.map((inv) => ({
    ...inv,
    status: inv.status === "PENDING" && inv.expiresAt.getTime() < now ? "EXPIRED" : inv.status,
  }))

  return NextResponse.json({ invitations: withStatus })
}
