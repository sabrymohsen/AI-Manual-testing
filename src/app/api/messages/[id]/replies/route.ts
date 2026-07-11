import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-guards";

// GET /api/messages/:id/replies -> Get thread replies
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const replies = await prisma.chatMessage.findMany({
      where: {
        parentId: params.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        attachments: true,
        _count: { select: { replies: true } },
      },
    });

    return NextResponse.json({ replies });
  } catch (error: any) {
    console.error("GET /api/messages/[id]/replies error:", error);
    return NextResponse.json({ error: "Failed to load thread replies" }, { status: 500 });
  }
}
