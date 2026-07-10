import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1).max(300).optional(),
  completed: z.boolean().optional(),
})

async function guard(subtaskId: string) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const }
  const subtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
    select: { task: { select: { project: { select: { userId: true } } } } },
  })
  if (!subtask) return { error: "Subtask not found", status: 404 as const }
  if (subtask.task.project.userId !== session.user.id)
    return { error: "Access denied", status: 403 as const }
  return { error: null, status: 200 as const }
}

export async function PATCH(request: Request, { params }: { params: { subtaskId: string } }) {
  const g = await guard(params.subtaskId)
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
  })
  return NextResponse.json({ subtask })
}

export async function DELETE(_req: Request, { params }: { params: { subtaskId: string } }) {
  const g = await guard(params.subtaskId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.subtask.delete({ where: { id: params.subtaskId } })
  return NextResponse.json({ success: true })
}
