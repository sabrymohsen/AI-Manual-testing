import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { ChannelRole } from "@prisma/client";

// GET /api/channels/:id -> Get channel details
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: params.id },
      include: {
        project: {
          select: { id: true, userId: true },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Verify user is a member of the project
    const isProjectMember = await prisma.project.findFirst({
      where: {
        id: channel.projectId,
        OR: [
          { userId },
          { projectMembers: { some: { userId } } },
        ],
      },
    });
    if (!isProjectMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // For private channels, verify user is a member of the channel
    if (channel.type === "PRIVATE") {
      const isChannelMember = channel.members.some((m) => m.userId === userId);
      if (!isChannelMember) {
        return NextResponse.json({ error: "Access denied: Invite only" }, { status: 403 });
      }
    }

    return NextResponse.json({ channel });
  } catch (error: any) {
    console.error("GET /api/channels/[id] error:", error);
    return NextResponse.json({ error: "Failed to load channel details" }, { status: 500 });
  }
}

// PATCH /api/channels/:id -> Update channel details
export async function PATCH(
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

    // Check if user is project owner or channel owner/admin
    const member = await prisma.channelMember.findFirst({
      where: { channelId: params.id, userId },
    });

    const isProjectOwner = channel.project.userId === userId;
    const isChannelOwner = member?.role === ChannelRole.OWNER || channel.createdById === userId;
    const isChannelAdmin = member?.role === ChannelRole.ADMIN;

    if (!isProjectOwner && !isChannelOwner && !isChannelAdmin) {
      return NextResponse.json({ error: "Unauthorized to edit channel details" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    const data: any = {};
    if (name) {
      data.name = name;
      data.slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");

      // Check unique slug constraints
      const existing = await prisma.chatChannel.findFirst({
        where: {
          projectId: channel.projectId,
          slug: data.slug,
          id: { not: params.id },
        },
      });
      if (existing) {
        return NextResponse.json({ error: "A channel with a similar name already exists" }, { status: 400 });
      }
    }
    if (description !== undefined) {
      data.description = description;
    }

    const updated = await prisma.chatChannel.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ channel: updated });
  } catch (error: any) {
    console.error("PATCH /api/channels/[id] error:", error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

// DELETE /api/channels/:id -> Delete channel
export async function DELETE(
  _request: Request,
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

    // Only owner of channel or project owner can delete
    const member = await prisma.channelMember.findFirst({
      where: { channelId: params.id, userId },
    });

    const isProjectOwner = channel.project.userId === userId;
    const isChannelOwner = member?.role === ChannelRole.OWNER || channel.createdById === userId;

    if (!isProjectOwner && !isChannelOwner) {
      return NextResponse.json({ error: "Only the channel owner or project owner can delete the channel" }, { status: 403 });
    }

    await prisma.chatChannel.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/channels/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
