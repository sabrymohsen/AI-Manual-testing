import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectMember } from "@/lib/api-guards";
import { ChannelType, ChannelRole } from "@prisma/client";

// GET /api/channels?projectId= -> List channels for a project
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
    // Get public and private channels the user has access to
    const channels = await prisma.chatChannel.findMany({
      where: {
        projectId,
        type: { in: [ChannelType.PUBLIC, ChannelType.PRIVATE] },
        OR: [
          { type: ChannelType.PUBLIC },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: {
          where: { userId },
          select: { lastReadAt: true, role: true, muted: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Compute unread counts for each channel
    const channelsWithUnread = await Promise.all(
      channels.map(async (channel) => {
        const memberInfo = channel.members[0];
        const lastRead = memberInfo?.lastReadAt || new Date(0);

        const unreadCount = await prisma.chatMessage.count({
          where: {
            channelId: channel.id,
            createdAt: { gt: lastRead },
            senderId: { not: userId },
            isDeleted: false,
          },
        });

        return {
          ...channel,
          unreadCount,
          role: memberInfo?.role || null,
          muted: memberInfo?.muted || false,
        };
      })
    );

    return NextResponse.json({ channels: channelsWithUnread });
  } catch (error: any) {
    console.error("GET /api/channels error:", error);
    return NextResponse.json({ error: "Failed to load channels" }, { status: 500 });
  }
}

// POST /api/channels -> Create a channel
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, type, projectId } = body;

    if (!name || !projectId) {
      return NextResponse.json({ error: "Name and projectId are required" }, { status: 400 });
    }

    const auth = await requireProjectMember(projectId);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const userId = auth.session!.user.id;

    // Slugify the name (e.g. "Bug Reports" -> "bug-reports")
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    // Check if slug is unique inside project
    const existing = await prisma.chatChannel.findUnique({
      where: {
        projectId_slug: {
          projectId,
          slug,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "A channel with a similar name already exists in this project" }, { status: 400 });
    }

    // Create the channel and automatically add the creator as OWNER
    const channel = await prisma.$transaction(async (tx) => {
      const newChannel = await tx.chatChannel.create({
        data: {
          name,
          slug,
          description,
          type: type || ChannelType.PUBLIC,
          projectId,
          createdById: userId,
        },
      });

      await tx.channelMember.create({
        data: {
          channelId: newChannel.id,
          userId,
          role: ChannelRole.OWNER,
        },
      });

      return newChannel;
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/channels error:", error);
    return NextResponse.json({ error: error.message || "Failed to create channel" }, { status: 500 });
  }
}
