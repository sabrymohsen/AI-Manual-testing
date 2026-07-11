import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { ChannelRole } from "@prisma/client";

// GET /api/messages/:id -> Get single message
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const message = await prisma.chatMessage.findUnique({
      where: { id: params.id },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        attachments: true,
        _count: { select: { replies: true } },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("GET /api/messages/[id] error:", error);
    return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
  }
}

// PATCH /api/messages/:id -> Edit message
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const message = await prisma.chatMessage.findUnique({
      where: { id: params.id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Only the sender can edit this message" }, { status: 403 });
    }

    // 24 hours restriction
    const hours = (new Date().getTime() - new Date(message.createdAt).getTime()) / (1000 * 60 * 60);
    if (hours > 24) {
      return NextResponse.json({ error: "Messages can only be edited within 24 hours" }, { status: 400 });
    }

    const body = await request.json();
    const { content, htmlContent } = body;

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const updated = await prisma.chatMessage.update({
      where: { id: params.id },
      data: {
        content,
        htmlContent,
        editedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        attachments: true,
        _count: { select: { replies: true } },
      },
    });

    // Notify socket clients
    try {
      const { getIO } = require("@/lib/socket-server");
      getIO().to(`channel:${message.channelId}`).emit("message-edited", updated);
    } catch {}

    return NextResponse.json({ message: updated });
  } catch (error: any) {
    console.error("PATCH /api/messages/[id] error:", error);
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

// DELETE /api/messages/:id -> Soft delete message
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const message = await prisma.chatMessage.findUnique({
      where: { id: params.id },
      include: {
        channel: true,
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Check permissions: sender, channel owner, channel admin, or project owner
    const member = await prisma.channelMember.findFirst({
      where: { channelId: message.channelId, userId },
    });

    const isSender = message.senderId === userId;
    const isProjectOwner = message.channel.projectId === userId; // Project creator
    const isChannelOwner = member?.role === ChannelRole.OWNER || message.channel.createdById === userId;
    const isChannelAdmin = member?.role === ChannelRole.ADMIN;

    if (!isSender && !isProjectOwner && !isChannelOwner && !isChannelAdmin) {
      return NextResponse.json({ error: "Unauthorized to delete this message" }, { status: 403 });
    }

    const updated = await prisma.chatMessage.update({
      where: { id: params.id },
      data: {
        isDeleted: true,
        content: "This message was deleted",
        htmlContent: "<p><i>This message was deleted</i></p>",
      },
    });

    // Notify socket clients
    try {
      const { getIO } = require("@/lib/socket-server");
      getIO().to(`channel:${message.channelId}`).emit("message-deleted", { messageId: message.id });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/messages/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
