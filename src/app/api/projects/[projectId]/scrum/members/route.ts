import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

// GET /api/projects/:projectId/scrum/members
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const [project, members] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
      select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    }),
    prisma.projectMember.findMany({
      where: { projectId: params.projectId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const list = members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
  }))

  // Include the project owner, who has no ProjectMember row
  if (project?.user && !list.some((m) => m.id === project.user.id)) {
    list.unshift({
      id: project.user.id,
      name: project.user.name,
      email: project.user.email,
      avatarUrl: project.user.avatarUrl,
      role: "Owner",
    })
  }

  return NextResponse.json({ members: list })
}
