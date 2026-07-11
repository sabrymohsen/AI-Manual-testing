import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key";

let io: SocketIOServer | null = null;

function startSocketServer() {
  const server = createServer();

  io = new SocketIOServer(server, {
    cors: {
      origin: ["http://localhost:3000", process.env.NEXT_PUBLIC_APP_URL || ""].filter(Boolean),
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token || typeof token !== "string") {
        return next(new Error("Unauthorized: No token provided"));
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch {
        return next(new Error("Unauthorized: Invalid token"));
      }

      if (!decoded?.id) {
        return next(new Error("Unauthorized: Invalid token payload"));
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true },
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
      try {
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
      } catch (err) {
        console.error("join-project error:", err);
      }
    });

    // Join a specific channel
    socket.on("join-channel", async (channelId: string) => {
      try {
        const channel = await prisma.chatChannel.findUnique({
          where: { id: channelId },
        });
        if (!channel) return;

        const inProject = await prisma.project.findFirst({
          where: {
            id: channel.projectId,
            OR: [{ userId }, { projectMembers: { some: { userId } } }],
          },
        });
        if (!inProject) return;

        const member = await prisma.channelMember.findFirst({
          where: { channelId, userId },
        });
        if ((channel.type === "PRIVATE" || channel.type === "DIRECT") && !member) return;

        socket.join(`channel:${channelId}`);
        socket.to(`channel:${channelId}`).emit("user-joined", {
          userId,
          name: user.name || user.email,
        });
      } catch (err) {
        console.error("join-channel error:", err);
      }
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
      try {
        const { channelId, content, htmlContent, parentId, mentions, attachments } = payload;

        const channel = await prisma.chatChannel.findUnique({
          where: { id: channelId },
        });
        if (!channel) return;

        const inProject = await prisma.project.findFirst({
          where: {
            id: channel.projectId,
            OR: [{ userId }, { projectMembers: { some: { userId } } }],
          },
        });
        if (!inProject) return;

        const member = await prisma.channelMember.findFirst({
          where: { channelId, userId },
        });
        if ((channel.type === "PRIVATE" || channel.type === "DIRECT") && !member) return;

        // Auto-join public channel if not a member
        if (!member) {
          await prisma.channelMember.create({
            data: { channelId, userId, role: "MEMBER" },
          });
        }

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
            sender: { select: { id: true, name: true, email: true } },
            reactions: { include: { user: { select: { id: true, name: true } } } },
            attachments: true,
            _count: { select: { replies: true } },
          },
        });

        await prisma.chatChannel.update({
          where: { id: channelId },
          data: { updatedAt: new Date() },
        });

        io?.to(`channel:${channelId}`).emit("new-message", message);

        mentions?.forEach((mentionedUserId) => {
          io?.to(`user:${mentionedUserId}`).emit("mentioned", {
            messageId: message.id,
            channelId,
            senderName: user.name || user.email,
            preview: content.slice(0, 100),
          });
        });
      } catch (err) {
        console.error("send-message error:", err);
      }
    });

    // Edit message
    socket.on("edit-message", async (payload: {
      messageId: string;
      content: string;
      htmlContent?: string;
    }) => {
      try {
        const msg = await prisma.chatMessage.findUnique({
          where: { id: payload.messageId },
        });
        if (!msg || msg.senderId !== userId) return;

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
            sender: { select: { id: true, name: true, email: true } },
            reactions: { include: { user: { select: { id: true, name: true } } } },
            attachments: true,
            _count: { select: { replies: true } },
          },
        });

        io?.to(`channel:${msg.channelId}`).emit("message-edited", updated);
      } catch (err) {
        console.error("edit-message error:", err);
      }
    });

    // Delete message (soft delete)
    socket.on("delete-message", async (messageId: string) => {
      try {
        const msg = await prisma.chatMessage.findUnique({
          where: { id: messageId },
        });
        if (!msg || msg.senderId !== userId) return;

        await prisma.chatMessage.update({
          where: { id: messageId },
          data: { isDeleted: true, content: "This message was deleted" },
        });

        io?.to(`channel:${msg.channelId}`).emit("message-deleted", { messageId });
      } catch (err) {
        console.error("delete-message error:", err);
      }
    });

    // Add reaction
    socket.on("add-reaction", async (payload: {
      messageId: string;
      emoji: string;
    }) => {
      try {
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
      } catch (err) {
        console.error("add-reaction error:", err);
      }
    });

    // Remove reaction
    socket.on("remove-reaction", async (payload: {
      messageId: string;
      emoji: string;
    }) => {
      try {
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
      } catch (err) {
        console.error("remove-reaction error:", err);
      }
    });

    // Typing indicator
    socket.on("typing", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("user-typing", {
        userId,
        name: user.name || user.email,
        channelId,
      });
    });

    // Disconnect
    socket.on("disconnect", async () => {
      try {
        await prisma.presence.update({
          where: { userId },
          data: { isOnline: false, lastSeen: new Date() },
        }).catch(() => {});

        const memberships = await prisma.projectMember.findMany({
          where: { userId },
          select: { projectId: true },
        });
        const ownedProjects = await prisma.project.findMany({
          where: { userId },
          select: { id: true },
        });

        const projectIds = new Set([
          ...memberships.map((m: any) => m.projectId),
          ...ownedProjects.map((p: any) => p.id),
        ]);

        projectIds.forEach((pid) => {
          io?.to(`project:${pid}`).emit("presence-update", {
            userId,
            isOnline: false,
          });
        });
      } catch (err) {
        console.error("disconnect error:", err);
      }
    });
  });

  const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || "3001");
  server.listen(SOCKET_PORT, () => {
    console.log(`> Socket.io server running on http://localhost:${SOCKET_PORT}`);
  });

  return io;
}

startSocketServer();
