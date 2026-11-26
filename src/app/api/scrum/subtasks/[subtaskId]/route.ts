import { notifySubtaskAssigned } from "@/lib/scrum/notifications"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import type { ProjectPermission } from "@/lib/permissions"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullish(),
  completed: z.boolean().optional(),
  // null clears the assignee.
  assigneeId: z.string().nullish(),
})

async function guard(subtaskId: string, permission: ProjectPermission) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const }
  const subtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
    select: { assigneeId: true, taskId: true, task: { select: { projectId: true } } },
  })
  if (!subtask) return { error: "Subtask not found", status: 404 as const }
  const resolved = await resolveProjectRole(subtask.task.projectId, session.user.id)
  if (!resolved || resolved.role === null) return { error: "Access denied", status: 404 as const }
  if (!resolved.permissions[permission]) return { error: `Missing permission: ${permission}`, status: 403 as const }
  return { error: null, status: 200 as const, userId: session.user.id, before: subtask }
}

export async function PATCH(request: Request, { params }: { params: { subtaskId: string } }) {
  const g = await guard(params.subtaskId, "canCreateStories")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const subtask = await prisma.subtask.update({
    where: { id: params.subtaskId },
    data: parsed.data,
    include: { assignee: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  })
  if (parsed.data.assigneeId && parsed.data.assigneeId !== g.before?.assigneeId && g.userId) {
    await notifySubtaskAssigned({ taskId: subtask.taskId, subtaskTitle: subtask.title, assigneeId: subtask.assigneeId, actorId: g.userId })
  }
  return NextResponse.json({ subtask })
}

export async function DELETE(_req: Request, { params }: { params: { subtaskId: string } }) {
  const g = await guard(params.subtaskId, "canDeleteStories")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.subtask.delete({ where: { id: params.subtaskId } })
  return NextResponse.json({ success: true })
}
