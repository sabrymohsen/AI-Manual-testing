import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";
import { notify } from "@/lib/notifications";
import { extractMentionedUserIds, messagePreview } from "@/lib/mentions";

// GET /api/channels/:id/messages?cursor=&limit=50 -> Cursor-paginated messages
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: params.id },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check project member
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

    // Check channel member for private channels and DMs
    if (channel.type === "PRIVATE" || channel.type === "DIRECT") {
      const isChannelMember = await prisma.channelMember.findFirst({
        where: { channelId: params.id, userId },
      });
      if (!isChannelMember) {
        return NextResponse.json({ error: "Access denied to private channel" }, { status: 403 });
      }
    }

    // Update lastReadAt for the current user in this channel
    await prisma.channelMember.updateMany({
      where: {
        channelId: params.id,
        userId,
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    // Fetch messages (main channel messages, i.e. parentId is null)
    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId: params.id,
        parentId: null,
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        attachments: true,
        _count: { select: { replies: true } },
      },
    });

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      const nextItem = messages.pop();
      nextCursor = nextItem?.id || null;
    }

    // We return messages in chronological order (oldest first) so it matches direct scroll structure
    // Since we queried desc, we reverse the results
    return NextResponse.json({
      messages: messages.reverse(),
      nextCursor,
    });
  } catch (error: any) {
    console.error("GET /api/channels/[id]/messages error:", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

// POST /api/channels/:id/messages -> Create message (fallback to REST)
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
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check project member
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

    // Check channel member for private channels and DMs
    const member = await prisma.channelMember.findFirst({
      where: { channelId: params.id, userId },
    });
    if ((channel.type === "PRIVATE" || channel.type === "DIRECT") && !member) {
      return NextResponse.json({ error: "Access denied to private channel" }, { status: 403 });
    }

    // If public channel and not joined yet, automatically join
    if (!member && channel.type === "PUBLIC") {
      await prisma.channelMember.create({
        data: {
          channelId: params.id,
          userId,
        },
      });
    }

    const body = await request.json();
    const { content, htmlContent, parentId, mentions, attachments } = body;

    if (!content && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: "Content or attachments are required" }, { status: 400 });
    }

    // Detect @mentions against the project roster (owner + members) and merge
    // with any explicit mention ids from the client.
    const rosterProject = await prisma.project.findUnique({
      where: { id: channel.projectId },
      select: {
        user: { select: { id: true, name: true, email: true } },
        projectMembers: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    let roster = [rosterProject?.user, ...(rosterProject?.projectMembers.map((m) => m.user) || [])]
      .filter((u): u is { id: string; name: string | null; email: string } => !!u)
      .filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i && u.id !== userId);
    // In private/DM channels only channel members can be mentioned.
    if (channel.type !== "PUBLIC") {
      const channelMembers = await prisma.channelMember.findMany({
        where: { channelId: params.id },
        select: { userId: true },
      });
      const memberIds = new Set(channelMembers.map((m) => m.userId));
      roster = roster.filter((u) => memberIds.has(u.id));
    }
    const mentionIds = [
      ...new Set([...((mentions as string[] | undefined) || []), ...extractMentionedUserIds(content || "", roster)]),
    ].filter((id) => id !== userId);

    const message = await prisma.chatMessage.create({
      data: {
        content,
        htmlContent,
        channelId: params.id,
        senderId: userId,
        parentId,
        type: attachments && attachments.length > 0 ? "FILE" : "TEXT",
        mentions: {
          create: mentionIds.map((uid: string) => ({ userId: uid })),
        },
        attachments: {
          create: attachments || [],
        },
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        attachments: true,
        _count: { select: { replies: true } },
      },
    });

    // Update channel activity
    await prisma.chatChannel.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    });

    // Broadcast in real-time if Socket.io is running
    try {
      const { getIO } = require("@/lib/socket-server");
      const io = getIO();
      io.to(`channel:${params.id}`).emit("new-message", message);

      mentionIds.forEach((mentionedUserId: string) => {
        io.to(`user:${mentionedUserId}`).emit("mentioned", {
          messageId: message.id,
          channelId: params.id,
          senderName: auth.session!.user.name || auth.session!.user.email,
          preview: content.slice(0, 100),
        });
      });
    } catch {
      // socket.io not running or initialized yet, ignore
    }

    // Persist + push a notification per mentioned user.
    if (mentionIds.length > 0) {
      const senderName = auth.session!.user.name || auth.session!.user.email;
      notify(
        mentionIds.map((mentionedUserId: string) => ({
          userId: mentionedUserId,
          type: "MENTION" as const,
          title: `${senderName} mentioned you`,
          body: messagePreview(content || ""),
          projectId: channel.projectId,
          actionUrl: `/projects/${channel.projectId}/team-chat`,
        }))
      ).catch(() => {});
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/channels/[id]/messages error:", error);
    return NextResponse.json({ error: error.message || "Failed to send message" }, { status: 500 });
  }
}

