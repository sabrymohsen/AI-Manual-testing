import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner } from "@/lib/api-guards"
import { z } from "zod"

const schema = z.object({
  name: z.string().min(1).max(200),
  goal: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sprints = await prisma.scrumSprint.findMany({
    where: { projectId: params.projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({ sprints })
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  // Only one ACTIVE sprint per project.
  if (d.status === "ACTIVE") {
    await prisma.scrumSprint.updateMany({
      where: { projectId: params.projectId, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    })
  }

  const sprint = await prisma.scrumSprint.create({
    data: {
      projectId: params.projectId,
      name: d.name,
      goal: d.goal ?? null,
      status: d.status ?? "PLANNED",
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
    },
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({ sprint }, { status: 201 })
}
