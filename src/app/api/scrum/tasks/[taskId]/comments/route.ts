import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"

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

  return NextResponse.json({ comment }, { status: 201 })
}
