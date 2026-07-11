import { Server as NetServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

let io: SocketIOServer | null = null;

export function initSocket(server: NetServer) {
  if (io) return io;

  io = new SocketIOServer(server, {
    path: "/api/socket",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token || typeof token !== "string") {
        return next(new Error("Unauthorized: No token provided"));
      }

      const decoded = await verifyToken(token);
      if (!decoded) {
        return next(new Error("Unauthorized: Invalid token"));
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true, avatarUrl: true },
      });

      if (!dbUser) {
        return next(new Error("Unauthorized: User not found"));
      }

      socket.data.userId = dbUser.id;
      socket.data.user = dbUser;
      next();
    } catch (err) {
      console.error("Socket authentication error:", err);
      next(new Error("Internal server error"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    const user = socket.data.user;

    // Join user's individual room for direct notifications
    socket.join(`user:${userId}`);

    // Join project room
    socket.on("join-project", async (projectId: string) => {
      // Check if project member or owner
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { userId },
            { projectMembers: { some: { userId } } },
          ],
        },
      });
      if (!project) return;

      socket.join(`project:${projectId}`);
      
      // Update presence
      await prisma.presence.upsert({
        where: { userId },
        update: { isOnline: true, lastSeen: new Date() },
        create: { userId, isOnline: true },
      });

      // Broadcast to project room
      io?.to(`project:${projectId}`).emit("presence-update", {
        userId,
        isOnline: true,
      });
    });

    // Join a specific channel
    socket.on("join-channel", async (channelId: string) => {
      const channel = await prisma.chatChannel.findUnique({
        where: { id: channelId },
      });
      if (!channel) return;

      // Verify membership
      const member = await prisma.channelMember.findFirst({
        where: { channelId, userId },
      });
      // If it is a public channel, they can join. If private, they must be a member.
      if (channel.type === "PRIVATE" && !member) return;

      socket.join(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit("user-joined", {
        userId,
        name: user.name || user.email,
      });
    });

    // Leave channel
    socket.on("leave-channel", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    // Send message
    socket.on("send-message", async (payload: {
      channelId: string;
      content: string;
      htmlContent?: string;
      parentId?: string;
      mentions?: string[];
      attachments?: { name: string; url: string; size: number; mimeType: string }[];
    }) => {
      const { channelId, content, htmlContent, parentId, mentions, attachments } = payload;

      const channel = await prisma.chatChannel.findUnique({
        where: { id: channelId },
      });
      if (!channel) return;

      // Verify membership
      const member = await prisma.channelMember.findFirst({
        where: { channelId, userId },
      });
      if (channel.type === "PRIVATE" && !member) return;

      // If they are not a member yet (public channel), join them auto
      if (!member) {
        await prisma.channelMember.create({
          data: {
            channelId,
            userId,
            role: "MEMBER",
          },
        });
      }

      // Create message
      const message = await prisma.chatMessage.create({
        data: {
          content,
          htmlContent,
          channelId,
          senderId: userId,
          parentId,
          type: attachments && attachments.length > 0 ? "FILE" : "TEXT",
          mentions: {
            create: mentions?.map((uid) => ({ userId: uid })) || [],
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

      // Update channel last activity
      await prisma.chatChannel.update({
        where: { id: channelId },
        data: { updatedAt: new Date() },
      });

      // Broadcast to channel
      io?.to(`channel:${channelId}`).emit("new-message", message);

      // Notify mentioned users
      mentions?.forEach((mentionedUserId) => {
        io?.to(`user:${mentionedUserId}`).emit("mentioned", {
          messageId: message.id,
          channelId,
          senderName: user.name || user.email,
          preview: content.slice(0, 100),
        });
      });
    });

    // Edit message
    socket.on("edit-message", async (payload: {
      messageId: string;
      content: string;
      htmlContent?: string;
    }) => {
      const msg = await prisma.chatMessage.findUnique({
        where: { id: payload.messageId },
      });
      if (!msg || msg.senderId !== userId) return;

      // Restrict edit to 24h
      const hoursSinceCreation = (new Date().getTime() - new Date(msg.createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) return;

      const updated = await prisma.chatMessage.update({
        where: { id: payload.messageId },
        data: {
          content: payload.content,
          htmlContent: payload.htmlContent,
          editedAt: new Date(),
        },
        include: {
          sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
          reactions: { include: { user: { select: { id: true, name: true } } } },
          attachments: true,
          _count: { select: { replies: true } },
        },
      });

      io?.to(`channel:${msg.channelId}`).emit("message-edited", updated);
    });

    // Delete message (soft delete)
    socket.on("delete-message", async (messageId: string) => {
      const msg = await prisma.chatMessage.findUnique({
        where: { id: messageId },
      });
      if (!msg || msg.senderId !== userId) return;

      await prisma.chatMessage.update({
        where: { id: messageId },
        data: { isDeleted: true, content: "This message was deleted" },
      });

      io?.to(`channel:${msg.channelId}`).emit("message-deleted", { messageId });
    });

    // Add reaction
    socket.on("add-reaction", async (payload: {
      messageId: string;
      emoji: string;
    }) => {
      const msg = await prisma.chatMessage.findUnique({
        where: { id: payload.messageId },
      });
      if (!msg) return;

      const reaction = await prisma.reaction.upsert({
        where: {
          messageId_userId_emoji: {
            messageId: payload.messageId,
            userId,
            emoji: payload.emoji,
          },
        },
        update: {},
        create: {
          messageId: payload.messageId,
          userId,
          emoji: payload.emoji,
        },
        include: { user: { select: { id: true, name: true } } },
      });

      io?.to(`channel:${msg.channelId}`).emit("reaction-added", {
        messageId: payload.messageId,
        reaction,
      });
    });

    // Remove reaction
    socket.on("remove-reaction", async (payload: {
      messageId: string;
      emoji: string;
    }) => {
      const msg = await prisma.chatMessage.findUnique({
        where: { id: payload.messageId },
      });
      if (!msg) return;

      await prisma.reaction.deleteMany({
        where: {
          messageId: payload.messageId,
          userId,
          emoji: payload.emoji,
        },
      });

      io?.to(`channel:${msg.channelId}`).emit("reaction-removed", {
        messageId: payload.messageId,
        emoji: payload.emoji,
        userId,
      });
    });

    // Typing indicator
    socket.on("typing", async (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("user-typing", {
        userId,
        name: user.name || user.email,
        channelId,
      });
    });

    // Disconnect
    socket.on("disconnect", async () => {
      await prisma.presence.update({
        where: { userId },
        data: { isOnline: false, lastSeen: new Date() },
      });
      // Find all rooms this socket was in to broadcast offline status
      // In this setup, we can broadcast presence update to all project rooms user has
      const memberships = await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const ownedProjects = await prisma.project.findMany({
        where: { userId },
        select: { id: true },
      });
      
      const projectIds = new Set([
        ...memberships.map((m) => m.projectId),
        ...ownedProjects.map((p) => p.id),
      ]);

      projectIds.forEach((pid) => {
        io?.to(`project:${pid}`).emit("presence-update", {
          userId,
          isOnline: false,
        });
      });
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
