import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { z } from "zod"

// GET /api/projects/:projectId/team — the project's assignee pool.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const members = await prisma.projectTeamMember.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  })
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
