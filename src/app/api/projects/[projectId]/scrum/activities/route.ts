import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner } from "@/lib/api-guards"

// GET /api/projects/:projectId/scrum/activities  — recent activity feed
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200)

  const activities = await prisma.activity.findMany({
    where: { task: { projectId: params.projectId } },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      task: { select: { id: true, title: true, taskNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ activities })
}
