import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { ChannelType } from "@prisma/client";

// POST /api/channels/:id/leave -> Leave a channel
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

    if (channel.type === ChannelType.DIRECT) {
      return NextResponse.json({ error: "Cannot leave a direct message channel" }, { status: 400 });
    }

    // Delete membership
    await prisma.channelMember.deleteMany({
      where: {
        channelId: params.id,
        userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST /api/channels/[id]/leave error:", error);
    return NextResponse.json({ error: "Failed to leave channel" }, { status: 500 });
  }
}
