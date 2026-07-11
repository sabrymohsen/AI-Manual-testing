import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";

// POST /api/messages/:id/reactions -> Add a reaction
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const body = await request.json();
    const { emoji } = body;

    if (!emoji) {
      return NextResponse.json({ error: "Emoji is required" }, { status: 400 });
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: params.id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const reaction = await prisma.reaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId: params.id,
          userId,
          emoji,
        },
      },
      update: {},
      create: {
        messageId: params.id,
        userId,
        emoji,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Notify socket clients
    try {
      const { getIO } = require("@/lib/socket-server");
      getIO().to(`channel:${message.channelId}`).emit("reaction-added", {
        messageId: params.id,
        reaction,
      });
    } catch {}

    return NextResponse.json({ reaction });
  } catch (error: any) {
    console.error("POST /api/messages/[id]/reactions error:", error);
    return NextResponse.json({ error: "Failed to add reaction" }, { status: 500 });
  }
}
