import { canUseProject } from "@/lib/api-guards"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { z } from "zod"

const schema = z.object({ content: z.string().min(1).max(5000) })
const authorSelect = { id: true, name: true, email: true, avatarUrl: true } as const

/** Confirm the session is a (non-viewer) member of the comment's project. */
async function guard(commentId: string) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const, userId: null }
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, task: { select: { projectId: true } } },
  })
  if (!comment) return { error: "Comment not found", status: 404 as const, userId: null }
  if (!(await canUseProject(comment.task.projectId, session.user.id, "write")))
    return { error: "Access denied", status: 403 as const, userId: null }
  return { error: null, status: 200 as const, userId: session.user.id }
}

export async function PATCH(request: Request, { params }: { params: { commentId: string } }) {
  const g = await guard(params.commentId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const comment = await prisma.comment.update({
    where: { id: params.commentId },
    data: { content: parsed.data.content },
    include: { author: { select: authorSelect } },
  })
  return NextResponse.json({ comment })
}

export async function DELETE(_req: Request, { params }: { params: { commentId: string } }) {
  const g = await guard(params.commentId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.comment.delete({ where: { id: params.commentId } })
  return NextResponse.json({ success: true })
}
