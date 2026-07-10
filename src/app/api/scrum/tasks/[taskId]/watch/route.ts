import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireTaskOwner, taskDetailInclude, serializeTask } from "@/lib/scrum/server"

/** Toggle the current user as a watcher of the task. */
export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.userId!

  const current = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { watchers: { where: { id: userId }, select: { id: true } } },
  })
  const watching = (current?.watchers.length ?? 0) > 0

  const task = await prisma.task.update({
    where: { id: params.taskId },
    data: {
      watchers: watching ? { disconnect: { id: userId } } : { connect: { id: userId } },
    },
    include: taskDetailInclude,
  })

  return NextResponse.json({ task: serializeTask(task, auth.boardKey), watching: !watching })
}
