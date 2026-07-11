import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { ChannelType, ChannelRole } from "@prisma/client";

// POST /api/channels/:id/join -> Join a public channel
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: params.id },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.type !== ChannelType.PUBLIC) {
      return NextResponse.json({ error: "Cannot join a private or direct message channel directly" }, { status: 400 });
    }

    // Verify project member
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

    // Upsert or create membership
    const member = await prisma.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId: params.id,
          userId,
        },
      },
      update: {},
      create: {
        channelId: params.id,
        userId,
        role: ChannelRole.MEMBER,
      },
    });

    return NextResponse.json({ member });
  } catch (error: any) {
    console.error("POST /api/channels/[id]/join error:", error);
    return NextResponse.json({ error: "Failed to join channel" }, { status: 500 });
  }
}
