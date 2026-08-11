import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner } from "@/lib/scrum/server"

const schema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullish(),
  assigneeId: z.string().nullish(),
})

/** Assignee fields returned with every subtask so the UI can show an avatar. */
const subtaskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const

// POST /api/scrum/tasks/:taskId/subtasks
export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  // An assignee must actually be a member of the project this task belongs to.
  if (parsed.data.assigneeId) {
    const allowed = await prisma.task.findFirst({
      where: {
        id: params.taskId,
        project: {
          OR: [
            { userId: parsed.data.assigneeId },
            { projectMembers: { some: { userId: parsed.data.assigneeId } } },
          ],
        },
      },
      select: { id: true },
    })
    if (!allowed) {
      return NextResponse.json({ error: "Assignee is not a member of this project" }, { status: 400 })
    }
  }

  const subtask = await prisma.subtask.create({
    data: {
      taskId: params.taskId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      assigneeId: parsed.data.assigneeId ?? null,
    },
    include: subtaskInclude,
  })
  return NextResponse.json({ subtask }, { status: 201 })
}
