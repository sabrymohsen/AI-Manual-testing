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
