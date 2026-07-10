import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner } from "@/lib/api-guards"

// GET /api/projects/:projectId/scrum/members
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const members = await prisma.projectMember.findMany({
    where: { projectId: params.projectId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    })),
  })
}
