import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectMember } from "@/lib/api-guards";
import { isPresenceFresh } from "@/lib/presence";

// GET /api/presence?projectId= -> Get presence status of project members
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const auth = await requireProjectMember(projectId);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectMembers: {
          select: { userId: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const memberIds = new Set<string>();
    memberIds.add(project.userId); // Add owner
    project.projectMembers.forEach((m) => memberIds.add(m.userId));

    const presences = await prisma.presence.findMany({
      where: {
        userId: { in: Array.from(memberIds) },
      },
      select: {
        userId: true,
        isOnline: true,
        lastSeen: true,
        typingIn: true,
      },
    });

    // Never report the raw sticky flag — a row left `isOnline: true` by a lost
    // disconnect (redeploy, closed laptop, dropped network) would otherwise
    // show that member as online forever.
    const now = Date.now();
    return NextResponse.json({
      presences: presences.map((p) => ({ ...p, isOnline: isPresenceFresh(p, now) })),
    });
  } catch (error: any) {
    console.error("GET /api/presence error:", error);
    return NextResponse.json({ error: "Failed to load presence statuses" }, { status: 500 });
  }
}
