import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"
import { notify } from "@/lib/notifications"

const schema = z.object({ content: z.string().min(1).max(5000) })

const authorSelect = { id: true, name: true, email: true, avatarUrl: true } as const

// POST /api/scrum/tasks/:taskId/comments
export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

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

  const comment = await prisma.comment.create({
    data: { taskId: params.taskId, authorId: auth.userId, content: parsed.data.content },
    include: { author: { select: authorSelect } },
  })
  await logActivity(params.taskId, "commented", parsed.data.content.slice(0, 140), auth.userId)

  // Notify the task reporter and assignees (excluding the commenter).
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: {
      title: true,
      projectId: true,
      reporterId: true,
      assignees: { select: { id: true } },
    },
  })
  if (task) {
    const commenterName = comment.author.name || comment.author.email
    const recipients = [
      ...new Set([task.reporterId, ...task.assignees.map((a) => a.id)].filter(Boolean) as string[]),
    ].filter((id) => id !== auth.userId)
    if (recipients.length > 0) {
      notify(
        recipients.map((userId) => ({
          userId,
          type: "COMMENT" as const,
          title: "New comment",
          body: `${commenterName} commented on ${task.title}`,
          projectId: task.projectId,
          actionUrl: `/projects/${task.projectId}/scrum?task=${params.taskId}`,
        }))
      ).catch(() => {})
    }
  }

  return NextResponse.json({ comment }, { status: 201 })
}
