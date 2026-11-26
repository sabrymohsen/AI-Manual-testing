import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"

/**
 * POST /api/channels/:id/read — "I've seen everything in this conversation up
 * to now." Called while a conversation is open and new messages arrive, so
 * messages read live don't come back as unread on the next visit.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.session!.user.id

  const channel = await prisma.chatChannel.findUnique({ where: { id: params.id }, select: { id: true, type: true, projectId: true } })
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

  const inProject = await prisma.project.findFirst({
    where: { id: channel.projectId, OR: [{ userId }, { projectMembers: { some: { userId } } }] },
    select: { id: true },
  })
  if (!inProject) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  if (channel.type === "PUBLIC") {
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId } },
      update: { lastReadAt: new Date() },
      create: { channelId: channel.id, userId, lastReadAt: new Date() },
    })
  } else {
    await prisma.channelMember.updateMany({ where: { channelId: channel.id, userId }, data: { lastReadAt: new Date() } })
  }
  return NextResponse.json({ ok: true })
}
