import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

// POST /api/invitations/[token]/decline — decline an invitation by token.
// No auth required (the recipient may not have an account).
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const invitation = await prisma.invitation.findUnique({
    where: { token: params.token },
    select: { id: true, status: true },
  })
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 })

  if (invitation.status === "ACCEPTED") {
    return NextResponse.json({ error: "This invitation was already accepted" }, { status: 409 })
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "DECLINED" },
  })

  return NextResponse.json({ success: true })
}
