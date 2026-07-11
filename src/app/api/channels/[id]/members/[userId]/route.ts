import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { ChannelRole } from "@prisma/client";

// DELETE /api/channels/:id/members/:userId -> Remove member from channel
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; userId: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const currentUserId = auth.session!.user.id;
  const targetUserId = params.userId;

  try {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: params.id },
      include: { project: true },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // If removing themselves, allow it directly
    if (currentUserId !== targetUserId) {
      const member = await prisma.channelMember.findFirst({
        where: { channelId: params.id, userId: currentUserId },
      });

      const isProjectOwner = channel.project.userId === currentUserId;
      const isChannelOwner = member?.role === ChannelRole.OWNER || channel.createdById === currentUserId;
      const isChannelAdmin = member?.role === ChannelRole.ADMIN;

      if (!isProjectOwner && !isChannelOwner && !isChannelAdmin) {
        return NextResponse.json({ error: "Unauthorized to remove members from this channel" }, { status: 403 });
      }
    }

    await prisma.channelMember.deleteMany({
      where: {
        channelId: params.id,
        userId: targetUserId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/channels/[id]/members/[userId] error:", error);
    return NextResponse.json({ error: "Failed to remove channel member" }, { status: 500 });
  }
}
