import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, taskDetailInclude, serializeTask, logActivity } from "@/lib/scrum/server"
import { notify } from "@/lib/notifications"
import { logUserActivity } from "@/lib/user-activity"

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "REVIEW", "TESTING", "DEPLOYED"] as const
const PRIORITIES = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] as const
const TYPES = ["STORY", "BUG", "TASK", "SUBTASK", "EPIC", "TEST_CASE"] as const
const RESOLUTIONS = ["DONE", "WONT_FIX", "DUPLICATE", "CANNOT_REPRODUCE"] as const

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional().nullable(),
  type: z.enum(TYPES).optional(),
  resolution: z.enum(RESOLUTIONS).optional().nullable(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  storyPoints: z.number().min(0).max(999).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  branchName: z.string().optional().nullable(),
  progress: z.number().int().min(0).max(100).optional(),
  boardRank: z.number().int().optional(),
  sprintId: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  reporterId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
  fixVersions: z.array(z.string()).optional(),
  affectedVersions: z.array(z.string()).optional(),
  environment: z.string().optional().nullable(),
  originalEstimate: z.number().int().min(0).optional().nullable(),
  remainingEstimate: z.number().int().min(0).optional().nullable(),
})

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const task = await prisma.task.findUnique({ where: { id: params.taskId }, include: taskDetailInclude })
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  return NextResponse.json({ task: serializeTask(task, auth.boardKey) })
}

export async function PATCH(request: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.permissions.canCreateStories) {
    return NextResponse.json({ error: "Missing permission: canCreateStories" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  const existing = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: {
      status: true,
      title: true,
      description: true,
      priority: true,
      storyPoints: true,
      assignees: { select: { id: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const data: any = {}
  if (d.title !== undefined) data.title = d.title
  if (d.description !== undefined) data.description = d.description
  if (d.type !== undefined) data.type = d.type
  if (d.resolution !== undefined) data.resolution = d.resolution
  if (d.status !== undefined) data.status = d.status
  if (d.priority !== undefined) data.priority = d.priority
  if (d.storyPoints !== undefined) data.storyPoints = d.storyPoints
  if (d.dueDate !== undefined) data.dueDate = d.dueDate ? new Date(d.dueDate) : null
  if (d.branchName !== undefined) data.branchName = d.branchName
  if (d.progress !== undefined) data.progress = d.progress
  if (d.boardRank !== undefined) data.boardRank = d.boardRank
  if (d.sprintId !== undefined) data.sprintId = d.sprintId
  if (d.epicId !== undefined) data.epicId = d.epicId
  if (d.reporterId !== undefined) data.reporterId = d.reporterId
  if (d.tags !== undefined) data.tags = d.tags
  if (d.labels !== undefined) data.labels = d.labels
  if (d.components !== undefined) data.components = d.components
  if (d.fixVersions !== undefined) data.fixVersions = d.fixVersions
  if (d.affectedVersions !== undefined) data.affectedVersions = d.affectedVersions
  if (d.environment !== undefined) data.environment = d.environment
  if (d.originalEstimate !== undefined) data.originalEstimate = d.originalEstimate
  if (d.remainingEstimate !== undefined) data.remainingEstimate = d.remainingEstimate
  if (d.assigneeIds !== undefined) data.assignees = { set: d.assigneeIds.map((id) => ({ id })) }

  const task = await prisma.task.update({
    where: { id: params.taskId },
    data,
    include: taskDetailInclude,
  })

  // Activity logging for meaningful changes (each row carries userId + createdAt,
  // so the activity feed shows who changed what and when).
  if (d.status !== undefined && d.status !== existing.status) {
    await logActivity(task.id, "moved", `${existing.status} → ${d.status}`, auth.userId)
    if (d.status === "DONE") {
      logUserActivity(auth.userId, "TASK_COMPLETED", `Completed "${task.title}"`, task.projectId)
    }
  }
  if (d.assigneeIds !== undefined) {
    const before = new Set(existing.assignees.map((a) => a.id))
    const after = new Set(d.assigneeIds)
    if (before.size !== after.size || [...after].some((id) => !before.has(id))) {
      await logActivity(task.id, "assigned", `${d.assigneeIds.length} assignee(s)`, auth.userId)
    }

    // Notify newly-added assignees (not the actor, not existing assignees).
    // Awaited rather than fire-and-forget: an unawaited promise can be torn
    // down with the request before the rows are written, which is exactly how
    // "I assigned it and they never got told" happens.
    const newAssignees = [...after].filter((id) => !before.has(id) && id !== auth.userId)
    if (newAssignees.length > 0) {
      const taskKey = auth.boardKey ? `${auth.boardKey}-${task.taskNumber}` : `#${task.taskNumber}`
      try {
        await notify(
          newAssignees.map((userId) => ({
            userId,
            type: "TASK_ASSIGNED" as const,
            title: `Assigned to ${taskKey}`,
            body: `You were assigned to ${task.title}`,
            projectId: task.projectId,
            actionUrl: `/projects/${task.projectId}/scrum?task=${task.id}`,
          }))
        )
      } catch (err) {
        console.error("Task assignment notification failed:", err)
      }
    }
  }
  if (d.description !== undefined && (d.description ?? "") !== (existing.description ?? "")) {
    await logActivity(task.id, "description_edited", "Updated the description", auth.userId)
  }
  if (d.title !== undefined && d.title !== existing.title) {
    await logActivity(task.id, "updated", `Renamed to "${d.title}"`, auth.userId)
  }
  if (d.priority !== undefined && d.priority !== existing.priority) {
    await logActivity(task.id, "updated", `Priority ${existing.priority} → ${d.priority}`, auth.userId)
  }
  if (d.storyPoints !== undefined && d.storyPoints !== existing.storyPoints) {
    await logActivity(task.id, "updated", `Story points set to ${d.storyPoints ?? "—"}`, auth.userId)
  }

  const fresh = await prisma.task.findUnique({ where: { id: params.taskId }, include: taskDetailInclude })
  return NextResponse.json({ task: serializeTask(fresh, auth.boardKey) })
}

export async function DELETE(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.permissions.canDeleteStories) {
    return NextResponse.json({ error: "Missing permission: canDeleteStories" }, { status: 403 })
  }

  await prisma.task.delete({ where: { id: params.taskId } })
  return NextResponse.json({ success: true })
}
