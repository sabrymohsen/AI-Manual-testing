import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"

const LINK_TYPES = ["blocks", "is blocked by", "relates to", "duplicates", "clones"] as const

const postSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  type: z.enum(LINK_TYPES),
})

/** Create a directional link between two tasks in the same project. */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }
  const { sourceId, targetId, type } = parsed.data

  if (sourceId === targetId) {
    return NextResponse.json({ error: "A task cannot be linked to itself" }, { status: 400 })
  }

  const auth = await requireTaskOwner(sourceId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const target = await prisma.task.findUnique({
    where: { id: targetId },
    select: { projectId: true, taskNumber: true },
  })
  if (!target || target.projectId !== auth.projectId) {
    return NextResponse.json({ error: "Target task not found in this project" }, { status: 404 })
  }

  const link = await prisma.taskLink.upsert({
    where: { sourceId_targetId_type: { sourceId, targetId, type } },
    create: { sourceId, targetId, type },
    update: {},
  })

  await logActivity(sourceId, "linked", `${type} ${auth.boardKey || "TASK"}-${target.taskNumber}`, auth.userId)

  return NextResponse.json({ link }, { status: 201 })
}
