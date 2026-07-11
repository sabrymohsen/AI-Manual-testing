import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { ChannelRole } from "@prisma/client";

// POST /api/channels/:id/members -> Add member to a channel
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: params.id },
      include: { project: true },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Verify inviter role
    const inviterMember = await prisma.channelMember.findFirst({
      where: { channelId: params.id, userId },
    });

    const isProjectOwner = channel.project.userId === userId;
    const isChannelOwner = inviterMember?.role === ChannelRole.OWNER || channel.createdById === userId;
    const isChannelAdmin = inviterMember?.role === ChannelRole.ADMIN;

    if (!isProjectOwner && !isChannelOwner && !isChannelAdmin) {
      return NextResponse.json({ error: "Unauthorized to add members to this channel" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }

    // Verify target user is a project member
    const isTargetProjectMember = await prisma.project.findFirst({
      where: {
        id: channel.projectId,
        OR: [
          { userId: targetUserId },
          { projectMembers: { some: { userId: targetUserId } } },
        ],
      },
    });

    if (!isTargetProjectMember) {
      return NextResponse.json({ error: "User is not a member of this project" }, { status: 400 });
    }

    // Add to channel
    const member = await prisma.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId: params.id,
          userId: targetUserId,
        },
      },
      update: {},
      create: {
        channelId: params.id,
        userId: targetUserId,
        role: ChannelRole.MEMBER,
      },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/channels/[id]/members error:", error);
    return NextResponse.json({ error: "Failed to add channel member" }, { status: 500 });
  }
}
