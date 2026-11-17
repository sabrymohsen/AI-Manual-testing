import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission } from "@/lib/api-guards"
import { z } from "zod"
import { logActivity } from "@/lib/scrum/server"

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "REVIEW", "TESTING", "DEPLOYED"] as const
const PRIORITIES = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] as const

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move"),
    taskIds: z.array(z.string()).min(1).max(200),
    // null / omitted = move to backlog
    sprintId: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("delete"),
    taskIds: z.array(z.string()).min(1).max(200),
  }),
  z.object({
    action: z.literal("update"),
    taskIds: z.array(z.string()).min(1).max(200),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    // null = remove from its epic
    epicId: z.string().nullable().optional(),
    // replaces the assignees; [] = unassign
    assigneeIds: z.array(z.string()).max(20).optional(),
  }),
])

/**
 * POST /api/projects/:projectId/scrum/tasks/bulk
 * Bulk move (to a sprint or the backlog), bulk update (status, priority,
 * epic, assignees) or bulk delete board tasks.
 */
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data

  const auth = await requireProjectPermission(
    params.projectId,
    data.action === "delete" ? "canDeleteStories" : "canCreateStories"
  )
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Scope every write to this project so foreign task ids are ignored.
  const where = { id: { in: data.taskIds }, projectId: params.projectId }

  if (data.action === "delete") {
    const res = await prisma.task.deleteMany({ where })
    return NextResponse.json({ affected: res.count })
  }

  if (data.action === "update") {
    if (data.epicId) {
      const epic = await prisma.scrumEpic.findFirst({ where: { id: data.epicId, projectId: params.projectId } })
      if (!epic) return NextResponse.json({ error: "Epic not found in this project" }, { status: 400 })
    }
    const tasks = await prisma.task.findMany({ where, select: { id: true, status: true, priority: true } })
    for (const t of tasks) {
      await prisma.task.update({
        where: { id: t.id },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.priority ? { priority: data.priority } : {}),
          ...(data.epicId !== undefined ? { epicId: data.epicId } : {}),
          ...(data.assigneeIds ? { assignees: { set: data.assigneeIds.map((id) => ({ id })) } } : {}),
        },
      })
      // Same history the board writes, so burndown and reports see bulk moves.
      if (data.status && data.status !== t.status) await logActivity(t.id, "moved", `${t.status} → ${data.status}`, auth.session?.user?.id ?? null)
      if (data.priority && data.priority !== t.priority) await logActivity(t.id, "updated", `Priority ${t.priority} → ${data.priority}`, auth.session?.user?.id ?? null)
    }
    return NextResponse.json({ affected: tasks.length })
  }

  const sprintId = data.sprintId ?? null
  if (sprintId) {
    const sprint = await prisma.scrumSprint.findFirst({ where: { id: sprintId, projectId: params.projectId } })
    if (!sprint) return NextResponse.json({ error: "Sprint not found in this project" }, { status: 400 })
  }
  const res = await prisma.task.updateMany({ where, data: { sprintId } })
  return NextResponse.json({ affected: res.count })
}
