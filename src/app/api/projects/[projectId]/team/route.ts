import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { syncProjectTeam } from "@/lib/team/sync-team"
import { z } from "zod"

// GET /api/projects/:projectId/team — the project's assignee pool.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  // Member-level: every assignee dropdown (bug form, test-case form) reads this.
  // Owner-only meant ordinary testers got a 404 and an empty developer list.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const load = () =>
    prisma.projectTeamMember.findMany({
      where: { projectId: params.projectId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })

  let members = await load()

  // First read after connecting a tracker: fill the pool from it instead of
  // returning nothing until someone opens the Team tab and presses Sync.
  if (members.length === 0) {
    const synced = await syncProjectTeam(params.projectId)
    if (synced.ok && synced.synced > 0) members = await load()
  }

  // No tracker (or it returned nobody): fall back to the app's own project
  // members, so a project without Jira/OpenProject still has assignees.
  if (members.length === 0) {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        user: { select: { id: true, name: true, email: true } },
        projectMembers: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
    })
    const people = new Map<string, { name: string; email: string | null; role: string | null }>()
    if (project?.user) people.set(project.user.id, { name: project.user.name || project.user.email, email: project.user.email, role: null })
    for (const m of project?.projectMembers ?? []) {
      if (m.user) people.set(m.user.id, { name: m.user.name || m.user.email, email: m.user.email, role: null })
    }
    if (people.size > 0) {
      await prisma.$transaction(
        Array.from(people, ([userId, p]) =>
          prisma.projectTeamMember.upsert({
            where: { projectId_provider_externalId: { projectId: params.projectId, provider: "QA Engine", externalId: userId } },
            create: { projectId: params.projectId, source: "synced", provider: "QA Engine", externalId: userId, name: p.name, email: p.email },
            update: { name: p.name, email: p.email, active: true },
          })
        )
      )
      members = await load()
    }
  }

  return NextResponse.json({ members })
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  role: z.string().max(100).optional().nullable(),
})

// POST /api/projects/:projectId/team — manually add a member.
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const member = await prisma.projectTeamMember.create({
    data: {
      projectId: params.projectId,
      source: "manual",
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      role: parsed.data.role ?? null,
    },
  })
  return NextResponse.json({ member }, { status: 201 })
}
