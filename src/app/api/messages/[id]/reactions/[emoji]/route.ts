import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";

// DELETE /api/messages/:id/reactions/:emoji -> Remove a reaction
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; emoji: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;
  const decodedEmoji = decodeURIComponent(params.emoji);

  try {
    const message = await prisma.chatMessage.findUnique({
      where: { id: params.id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await prisma.reaction.deleteMany({
      where: {
        messageId: params.id,
        userId,
        emoji: decodedEmoji,
      },
    });

    // Notify socket clients
    try {
      const { getIO } = require("@/lib/socket-server");
      getIO().to(`channel:${message.channelId}`).emit("reaction-removed", {
        messageId: params.id,
        emoji: decodedEmoji,
        userId,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/messages/[id]/reactions/[emoji] error:", error);
    return NextResponse.json({ error: "Failed to remove reaction" }, { status: 500 });
  }
}
