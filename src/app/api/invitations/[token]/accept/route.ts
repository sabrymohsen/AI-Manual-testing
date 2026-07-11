import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"
import { PROJECT_ROLES } from "@/lib/permissions"
import { notify } from "@/lib/notifications"
import { logUserActivity } from "@/lib/user-activity"

// POST /api/invitations/[token]/accept — accept an invitation as the logged-in
// user. Joins the project with the invitation's role and marks it ACCEPTED.
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const invitation = await prisma.invitation.findUnique({
    where: { token: params.token },
    include: { project: { select: { id: true, name: true, userId: true } } },
  })
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 })

  if (invitation.status === "ACCEPTED") {
    return NextResponse.json({ success: true, projectId: invitation.projectId, alreadyAccepted: true })
  }
  if (invitation.status === "DECLINED") {
    return NextResponse.json({ error: "This invitation was declined" }, { status: 410 })
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } })
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 })
  }

  const userId = auth.session.user.id
  const role = PROJECT_ROLES.includes(invitation.role as any) ? invitation.role : "Member"

  // Already the owner or a member? Just mark accepted.
  if (invitation.project.userId !== userId) {
    await prisma.projectMember.upsert({
      where: { userId_projectId: { userId, projectId: invitation.projectId } },
      update: {}, // don't downgrade an existing role
      create: { projectId: invitation.projectId, userId, role },
    })
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  })

  const inviter = await prisma.user.findUnique({
    where: { id: invitation.invitedById },
    select: { name: true, email: true },
  })
  notify({
    userId,
    type: "INVITATION",
    title: `You've been added to ${invitation.project.name}`,
    body: `${inviter?.name || inviter?.email || "A teammate"} added you as ${role}`,
    projectId: invitation.projectId,
    actionUrl: `/projects/${invitation.projectId}/scrum`,
  }).catch(() => {})
  logUserActivity(userId, "PROJECT_JOINED", `Joined project "${invitation.project.name}"`, invitation.projectId)

  return NextResponse.json({
    success: true,
    projectId: invitation.projectId,
    projectName: invitation.project.name,
  })
}
