import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { withNextTaskNumber } from "@/lib/scrum/task-number"
import { requireTaskOwner, taskDetailInclude, serializeTask, logActivity } from "@/lib/scrum/server"

/** Clone a task with its subtasks, labels, assignees, and outgoing links. */
export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const src = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      assignees: { select: { id: true } },
      subtasks: true,
      linkedTasks: true,
      taskAttachments: true,
    },
  })
  if (!src) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const clone = await withNextTaskNumber(src.projectId, (taskNumber) =>
        prisma.task.create({
    data: {
          taskNumber,
      title: `${src.title} - Copy`,
      description: src.description,
      type: src.type,
      status: src.status,
      priority: src.priority,
      storyPoints: src.storyPoints,
      dueDate: src.dueDate,
      branchName: src.branchName,
      projectId: src.projectId,
      sprintId: src.sprintId,
      epicId: src.epicId,
      reporterId: auth.userId,
      tags: src.tags,
      labels: src.labels,
      components: src.components,
      fixVersions: src.fixVersions,
      affectedVersions: src.affectedVersions,
      environment: src.environment,
      originalEstimate: src.originalEstimate,
      remainingEstimate: src.remainingEstimate,
      assignees: { connect: src.assignees.map((a) => ({ id: a.id })) },
      subtasks: { create: src.subtasks.map((s) => ({ title: s.title, completed: s.completed })) },
      taskAttachments: {
        create: src.taskAttachments.map((a) => ({
          name: a.name,
          url: a.url,
          size: a.size,
          mimeType: a.mimeType,
          uploadedById: a.uploadedById,
        })),
      },
    },
    include: taskDetailInclude,
  }))

  // Duplicate outgoing links to the same targets.
  if (src.linkedTasks.length) {
    await prisma.taskLink.createMany({
      data: src.linkedTasks.map((l) => ({ type: l.type, sourceId: clone.id, targetId: l.targetId })),
      skipDuplicates: true,
    })
  }

  await logActivity(clone.id, "created", `Cloned from ${auth.boardKey || "TASK"}-${src.taskNumber}`, auth.userId)

  return NextResponse.json({ task: serializeTask(clone, auth.boardKey) }, { status: 201 })
}
