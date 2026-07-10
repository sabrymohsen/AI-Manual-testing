import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, taskDetailInclude, serializeTask, logActivity } from "@/lib/scrum/server"

const memberSelect = { id: true, name: true, email: true, avatarUrl: true } as const

/** Format minutes as a Jira-style "1h 30m" string. */
function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m"
}

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const workLogs = await prisma.workLog.findMany({
    where: { taskId: params.taskId },
    orderBy: { startedAt: "desc" },
    include: { user: { select: memberSelect } },
  })
  return NextResponse.json({ workLogs })
}

const postSchema = z.object({
  timeSpent: z.number().int().positive(), // minutes
  description: z.string().optional().nullable(),
  startedAt: z.string().datetime().optional(),
})

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
  const { timeSpent, description, startedAt } = parsed.data

  const existing = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { timeSpent: true, remainingEstimate: true, originalEstimate: true },
  })
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  await prisma.workLog.create({
    data: {
      taskId: params.taskId,
      userId: auth.userId,
      timeSpent,
      description: description ?? null,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
    },
  })

  // Roll up totals: accumulate time spent, draw down remaining estimate.
  const nextSpent = (existing.timeSpent ?? 0) + timeSpent
  const baseRemaining = existing.remainingEstimate ?? existing.originalEstimate ?? 0
  const nextRemaining = Math.max(0, baseRemaining - timeSpent)

  const task = await prisma.task.update({
    where: { id: params.taskId },
    data: { timeSpent: nextSpent, remainingEstimate: nextRemaining },
    include: taskDetailInclude,
  })

  await logActivity(params.taskId, "work_logged", `Logged ${fmt(timeSpent)}`, auth.userId)

  return NextResponse.json({ task: serializeTask(task, auth.boardKey) }, { status: 201 })
}
