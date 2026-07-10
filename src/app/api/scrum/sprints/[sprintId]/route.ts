import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { z } from "zod"

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  goal: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

async function guard(sprintId: string) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const, projectId: null }
  const sprint = await prisma.scrumSprint.findUnique({
    where: { id: sprintId },
    select: { projectId: true, project: { select: { userId: true } } },
  })
  if (!sprint) return { error: "Sprint not found", status: 404 as const, projectId: null }
  if (sprint.project.userId !== session.user.id)
    return { error: "Access denied", status: 403 as const, projectId: null }
  return { error: null, status: 200 as const, projectId: sprint.projectId }
}

export async function PATCH(request: Request, { params }: { params: { sprintId: string } }) {
  const g = await guard(params.sprintId)
  if (g.error !== null) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const d = parsed.data

  if (d.status === "ACTIVE") {
    await prisma.scrumSprint.updateMany({
      where: { projectId: g.projectId, status: "ACTIVE", id: { not: params.sprintId } },
      data: { status: "COMPLETED" },
    })
  }

  const data: any = {}
  if (d.name !== undefined) data.name = d.name
  if (d.goal !== undefined) data.goal = d.goal
  if (d.status !== undefined) data.status = d.status
  if (d.startDate !== undefined) data.startDate = d.startDate ? new Date(d.startDate) : null
  if (d.endDate !== undefined) data.endDate = d.endDate ? new Date(d.endDate) : null

  const sprint = await prisma.scrumSprint.update({
    where: { id: params.sprintId },
    data,
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({ sprint })
}

export async function DELETE(_req: Request, { params }: { params: { sprintId: string } }) {
  const g = await guard(params.sprintId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.scrumSprint.delete({ where: { id: params.sprintId } })
  return NextResponse.json({ success: true })
}
