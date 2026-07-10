import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner } from "@/lib/scrum/server"

const schema = z.object({ title: z.string().min(1).max(300) })

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

  const subtask = await prisma.subtask.create({
    data: { taskId: params.taskId, title: parsed.data.title },
  })
  return NextResponse.json({ subtask }, { status: 201 })
}
