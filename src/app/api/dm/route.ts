import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectMember } from "@/lib/api-guards";
import { ChannelType, ChannelRole } from "@prisma/client";

// GET /api/dm?projectId= -> List DM channels for user
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const auth = await requireProjectMember(projectId);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const dmChannels = await prisma.chatChannel.findMany({
      where: {
        projectId,
        type: ChannelType.DIRECT,
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Compute unread counts for each DM
    const dmsWithUnread = await Promise.all(
      dmChannels.map(async (channel) => {
        const memberInfo = channel.members.find((m) => m.userId === userId);
        const lastRead = memberInfo?.lastReadAt || new Date(0);

        const unreadCount = await prisma.chatMessage.count({
          where: {
            channelId: channel.id,
            createdAt: { gt: lastRead },
            senderId: { not: userId },
            isDeleted: false,
          },
        });

        // Add the other member's info explicitly for client ease
        const otherMember = channel.members.find((m) => m.userId !== userId)?.user || null;

        return {
          ...channel,
          unreadCount,
          otherMember,
        };
      })
    );

    return NextResponse.json({ dms: dmsWithUnread });
  } catch (error: any) {
    console.error("GET /api/dm error:", error);
    return NextResponse.json({ error: "Failed to load DM channels" }, { status: 500 });
  }
}

// POST /api/dm -> Create or get 1-on-1 DM channel
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetUserId, projectId } = body;

    if (!targetUserId || !projectId) {
      return NextResponse.json({ error: "targetUserId and projectId are required" }, { status: 400 });
    }

    const auth = await requireProjectMember(projectId);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const userId = auth.session!.user.id;

    if (userId === targetUserId) {
      return NextResponse.json({ error: "Cannot start a DM with yourself" }, { status: 400 });
    }

    // Verify target user is also project member
    const isTargetMember = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: targetUserId },
          { projectMembers: { some: { userId: targetUserId } } },
        ],
      },
    });

    if (!isTargetMember) {
      return NextResponse.json({ error: "Target user is not a project member" }, { status: 400 });
    }

    // Check if DM channel already exists between these two users
    let dmChannel = await prisma.chatChannel.findFirst({
      where: {
        projectId,
        type: ChannelType.DIRECT,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    if (dmChannel) {
      // Find other member
      const otherMember = dmChannel.members.find((m) => m.userId !== userId)?.user || null;
      return NextResponse.json({ dm: { ...dmChannel, unreadCount: 0, otherMember } });
    }

    // Create new DM channel
    const uniqueSlug = `dm-${userId.slice(0, 8)}-${targetUserId.slice(0, 8)}-${Date.now()}`;
    const name = `DM-${userId.slice(0, 4)}-${targetUserId.slice(0, 4)}`;

    const newChannel = await prisma.$transaction(async (tx) => {
      const channel = await tx.chatChannel.create({
        data: {
          name,
          slug: uniqueSlug,
          type: ChannelType.DIRECT,
          projectId,
          createdById: userId,
        },
      });

      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId,
          role: ChannelRole.OWNER,
        },
      });

      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId: targetUserId,
          role: ChannelRole.MEMBER,
        },
      });

      return channel;
    });

    // Re-query with members list
    const finalChannel = await prisma.chatChannel.findUnique({
      where: { id: newChannel.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    const otherMember = finalChannel?.members.find((m) => m.userId !== userId)?.user || null;

    return NextResponse.json({ dm: { ...finalChannel, unreadCount: 0, otherMember } }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/dm error:", error);
    return NextResponse.json({ error: "Failed to initialize DM channel" }, { status: 500 });
  }
}
