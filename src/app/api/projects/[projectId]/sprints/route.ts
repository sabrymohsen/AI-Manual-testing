import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// GET /api/projects/[projectId]/sprints
// All sprints for the project, ordered, each with a story summary (points/count).
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const sprints = await prisma.sprint.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ status: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
    include: {
      requirements: {
        select: { id: true, storyPoints: true, status: true },
      },
    },
  })

  return NextResponse.json({
    sprints: sprints.map((s) => ({
      id: s.id,
      name: s.name,
      goal: s.goal,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      orderIndex: s.orderIndex,
      completedAt: s.completedAt,
      storyCount: s.requirements.length,
      totalPoints: s.requirements.reduce((sum, r) => sum + (r.storyPoints || 0), 0),
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().max(500).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

// POST /api/projects/[projectId]/sprints — create a Future sprint.
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const raw = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))

  const count = await prisma.sprint.count({ where: { projectId: params.projectId } })
  const sprint = await prisma.sprint.create({
    data: {
      projectId: params.projectId,
      name: parsed.data.name.trim(),
      goal: parsed.data.goal?.trim() || null,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      orderIndex: count,
    },
  })

  return NextResponse.json({ sprint })
}
