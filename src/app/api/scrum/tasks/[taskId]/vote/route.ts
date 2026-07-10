import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireTaskOwner, taskDetailInclude, serializeTask } from "@/lib/scrum/server"

/** Toggle the current user's vote and keep the denormalized `votes` count in sync. */
export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.userId!

  const current = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { votedBy: { where: { id: userId }, select: { id: true } } },
  })
  const voted = (current?.votedBy.length ?? 0) > 0

  const task = await prisma.task.update({
    where: { id: params.taskId },
    data: {
      votedBy: voted ? { disconnect: { id: userId } } : { connect: { id: userId } },
      votes: { increment: voted ? -1 : 1 },
    },
    include: taskDetailInclude,
  })

  return NextResponse.json({ task: serializeTask(task, auth.boardKey), voted: !voted })
}
