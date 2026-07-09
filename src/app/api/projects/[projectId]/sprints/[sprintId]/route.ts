import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(500).optional().nullable(),
  status: z.enum(["Future", "Active", "Completed"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

// PATCH /api/projects/[projectId]/sprints/[sprintId]
// Update fields, or start/complete a sprint. On "Completed", unfinished stories
// (not Covered/Deprecated) are moved back to the backlog (sprintId = null).
export async function PATCH(request: Request, { params }: { params: { projectId: string; sprintId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const sprint = await prisma.sprint.findFirst({ where: { id: params.sprintId, projectId: params.projectId } })
  if (!sprint) return notFoundResponse("Sprint not found")

  const raw = await request.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  const d = parsed.data

  // Only one Active sprint at a time — starting one is exclusive.
  if (d.status === "Active") {
    await prisma.sprint.updateMany({
      where: { projectId: params.projectId, status: "Active", id: { not: sprint.id } },
      data: { status: "Completed", completedAt: new Date() },
    })
  }

  const updated = await prisma.sprint.update({
    where: { id: sprint.id },
    data: {
      name: d.name?.trim(),
      goal: d.goal !== undefined ? d.goal?.trim() || null : undefined,
      status: d.status,
      startDate: d.startDate !== undefined ? (d.startDate ? new Date(d.startDate) : null) : undefined,
      endDate: d.endDate !== undefined ? (d.endDate ? new Date(d.endDate) : null) : undefined,
      completedAt: d.status === "Completed" ? new Date() : undefined,
    },
  })

  if (d.status === "Completed") {
    await prisma.requirement.updateMany({
      where: { sprintId: sprint.id, status: { notIn: ["Covered", "Deprecated"] } },
      data: { sprintId: null },
    })
  }

  return NextResponse.json({ sprint: updated })
}

// DELETE — remove a sprint; its stories fall back to the backlog.
export async function DELETE(_request: Request, { params }: { params: { projectId: string; sprintId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const sprint = await prisma.sprint.findFirst({ where: { id: params.sprintId, projectId: params.projectId } })
  if (!sprint) return notFoundResponse("Sprint not found")

  await prisma.requirement.updateMany({ where: { sprintId: sprint.id }, data: { sprintId: null } })
  await prisma.sprint.delete({ where: { id: sprint.id } })

  return NextResponse.json({ ok: true })
}
