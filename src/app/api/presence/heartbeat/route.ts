import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";

// POST /api/presence/heartbeat -> Update heartbeat & status
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.session!.user.id;

  try {
    const presence = await prisma.presence.upsert({
      where: { userId },
      update: {
        isOnline: true,
        lastSeen: new Date(),
      },
      create: {
        userId,
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    // Notify all project rooms this user belongs to
    try {
      const { getIO } = require("@/lib/socket-server");
      const io = getIO();

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
        io.to(`project:${pid}`).emit("presence-update", {
          userId,
          isOnline: true,
        });
      });
    } catch {}

    return NextResponse.json({ presence });
  } catch (error: any) {
    console.error("POST /api/presence/heartbeat error:", error);
    return NextResponse.json({ error: "Failed to update heartbeat" }, { status: 500 });
  }
}
