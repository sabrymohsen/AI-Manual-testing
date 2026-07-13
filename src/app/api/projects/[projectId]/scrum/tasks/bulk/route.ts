import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission } from "@/lib/api-guards"
import { z } from "zod"

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
])

/**
 * POST /api/projects/:projectId/scrum/tasks/bulk
 * Bulk move (to a sprint or the backlog) or bulk delete board tasks.
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

  const sprintId = data.sprintId ?? null
  if (sprintId) {
    const sprint = await prisma.scrumSprint.findFirst({ where: { id: sprintId, projectId: params.projectId } })
    if (!sprint) return NextResponse.json({ error: "Sprint not found in this project" }, { status: 400 })
  }
  const res = await prisma.task.updateMany({ where, data: { sprintId } })
  return NextResponse.json({ affected: res.count })
}
