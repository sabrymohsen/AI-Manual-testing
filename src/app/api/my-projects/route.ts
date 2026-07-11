import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"
import { normalizeRole } from "@/lib/permissions"
import { getProjectLimit } from "@/lib/plan-limits"

// GET /api/my-projects — every project the current user belongs to (as creator
// or member), each with the user's role. Also returns their project-creation
// allowance so the switcher / projects page can gate the "Create" button.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const userId = auth.session.user.id

  const [memberships, createdProjects, user] = await Promise.all([
    prisma.projectMember.findMany({
      where: { userId },
      include: { project: { select: { id: true, name: true, environment: true, userId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // Projects the user created but may not have a ProjectMember row for.
    prisma.project.findMany({
      where: { userId },
      select: { id: true, name: true, environment: true, userId: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true, role: true } }),
  ])

  const byId = new Map<string, { id: string; name: string; environment: string; role: string }>()
  for (const m of memberships) {
    const p = m.project
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      environment: String(p.environment),
      role: p.userId === userId ? "Owner" : normalizeRole(m.role),
    })
  }
  // Creator always appears as Owner even without a member row.
  for (const p of createdProjects) {
    if (!byId.has(p.id)) {
      byId.set(p.id, { id: p.id, name: p.name, environment: String(p.environment), role: "Owner" })
    }
  }

  const projects = Array.from(byId.values())
  const ownedCount = await prisma.project.count({ where: { userId } })
  const limit = getProjectLimit(user?.plan, user?.role)

  return NextResponse.json({
    projects,
    ownedCount,
    limit: limit === Number.POSITIVE_INFINITY ? null : limit,
    canCreateProject: ownedCount < limit,
  })
}
