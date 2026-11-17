import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"
import { notify } from "@/lib/notifications"
import { mentionedUserIds, mentionsToPlain } from "@/lib/scrum/mentions"

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
  await logActivity(params.taskId, "commented", mentionsToPlain(parsed.data.content).text.slice(0, 140), auth.userId)

  // Notify people @mentioned (only real members of this project), then the
  // reporter, assignees and watchers — each person once, never the commenter.
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: {
      title: true,
      taskNumber: true,
      projectId: true,
      reporterId: true,
      assignees: { select: { id: true } },
      watchers: { select: { id: true } },
      project: { select: { boardKey: true, userId: true } },
    },
  })
  if (task) {
    const commenterName = comment.author.name || comment.author.email
    const key = `${task.project?.boardKey || "TASK"}-${task.taskNumber}`
    const actionUrl = `/projects/${task.projectId}/scrum?task=${params.taskId}`
    const wanted = mentionedUserIds(parsed.data.content).filter((id) => id !== auth.userId)
    const members = wanted.length
      ? await prisma.user.findMany({
          where: {
            id: { in: wanted },
            OR: [{ id: task.project?.userId ?? "" }, { projectMemberships: { some: { projectId: task.projectId } } }],
          },
          select: { id: true },
        })
      : []
    const mentioned = new Set(members.map((m) => m.id))
    const followers = [task.reporterId, ...task.assignees.map((a) => a.id), ...task.watchers.map((w) => w.id)]
      .filter((id): id is string => !!id && id !== auth.userId && !mentioned.has(id))
    const notes = [
      ...[...mentioned].map((userId) => ({
        userId,
        type: "MENTION" as const,
        title: "You were mentioned",
        body: `${commenterName} mentioned you on ${key} ${task.title}`,
        projectId: task.projectId,
        actionUrl,
      })),
      ...[...new Set(followers)].map((userId) => ({
        userId,
        type: "COMMENT" as const,
        title: "New comment",
        body: `${commenterName} commented on ${key} ${task.title}`,
        projectId: task.projectId,
        actionUrl,
      })),
    ]
    if (notes.length > 0) notify(notes).catch(() => {})
  }

  return NextResponse.json({ comment }, { status: 201 })
}
