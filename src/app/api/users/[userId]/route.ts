import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

// GET /api/users/:userId -> public profile, visible only to teammates who
// share at least one project with the target (global Admins can view anyone).
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const viewerId = auth.session!.user.id
  const targetId = params.userId

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      jobTitle: true,
      department: true,
      bio: true,
      role: true,
      createdAt: true,
    },
  })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const isAdmin = auth.session!.user.role === "Admin"
  const isSelf = viewerId === targetId

  // Projects both the viewer and the target belong to (as owner or member).
  const sharedProjects = await prisma.project.findMany({
    where: {
      AND: [
        { OR: [{ userId: viewerId }, { projectMembers: { some: { userId: viewerId } } }] },
        { OR: [{ userId: targetId }, { projectMembers: { some: { userId: targetId } } }] },
      ],
    },
    select: {
      id: true,
      name: true,
      userId: true,
      projectMembers: {
        where: { userId: targetId },
        select: { role: true },
      },
    },
    orderBy: { name: "asc" },
  })

  if (!isAdmin && !isSelf && sharedProjects.length === 0) {
    return NextResponse.json(
      { error: "Access denied — you don't share a project with this user" },
      { status: 403 }
    )
  }

  return NextResponse.json({
    user: target,
    sharedProjects: sharedProjects.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.userId === targetId ? "Owner" : p.projectMembers[0]?.role || "Member",
    })),
  })
}
