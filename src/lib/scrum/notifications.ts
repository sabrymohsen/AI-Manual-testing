import { prisma } from "@/lib/db"
import { notify, type NotificationInput } from "@/lib/notifications"

/**
 * Scrum notifications beyond comments: a task moving column or sprint, and a
 * subtask being given to someone. Everyone who follows the task (reporter,
 * assignees, watchers) hears about moves; the person who made the change
 * never notifies themselves.
 */

const STATUS_LABEL: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "In Review",
  TESTING: "Testing",
  DEPLOYED: "Deployed",
  DONE: "Done",
}

async function actorName(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
  return u?.name || u?.email || "Someone"
}

async function loadTask(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      projectId: true,
      reporterId: true,
      assignees: { select: { id: true } },
      watchers: { select: { id: true } },
      project: { select: { boardKey: true } },
    },
  })
}

const taskUrl = (projectId: string, taskId: string) => `/projects/${projectId}/scrum?task=${taskId}`

/** "Sara moved SHOP-12 to Testing", to the task's followers. */
export async function notifyTaskMoved(opts: {
  taskId: string
  actorId: string
  toStatus?: string
  toSprintName?: string | null
}) {
  try {
    const task = await loadTask(opts.taskId)
    if (!task) return
    const name = await actorName(opts.actorId)
    const key = `${task.project?.boardKey || "TASK"}-${task.taskNumber}`
    const where = opts.toStatus
      ? STATUS_LABEL[opts.toStatus] ?? opts.toStatus
      : opts.toSprintName
        ? opts.toSprintName
        : "the backlog"
    const recipients = new Set<string>(
      [task.reporterId, ...task.assignees.map((a) => a.id), ...task.watchers.map((w) => w.id)].filter(
        (id): id is string => !!id && id !== opts.actorId
      )
    )
    if (!recipients.size) return
    const payloads: NotificationInput[] = [...recipients].map((userId) => ({
      userId,
      type: "TASK_MOVED",
      title: `${name} moved ${key} to ${where}`,
      body: task.title,
      projectId: task.projectId,
      actionUrl: taskUrl(task.projectId, task.id),
      data: { taskId: task.id, status: opts.toStatus ?? null },
    }))
    await notify(payloads)
  } catch (err) {
    console.error("[notify] task moved failed:", err)
  }
}

/** "Sara assigned you SHOP-12", to newly added assignees. */
export async function notifyTaskAssigned(opts: { taskId: string; actorId: string; userIds: string[] }) {
  const userIds = opts.userIds.filter((id) => id !== opts.actorId)
  if (!userIds.length) return
  try {
    const task = await loadTask(opts.taskId)
    if (!task) return
    const name = await actorName(opts.actorId)
    const key = `${task.project?.boardKey || "TASK"}-${task.taskNumber}`
    await notify(
      userIds.map((userId) => ({
        userId,
        type: "TASK_ASSIGNED" as const,
        title: `${name} assigned you ${key}`,
        body: task.title,
        projectId: task.projectId,
        actionUrl: taskUrl(task.projectId, task.id),
        data: { taskId: task.id },
      }))
    )
  } catch (err) {
    console.error("[notify] task assigned failed:", err)
  }
}

/** "Sara gave you a subtask on SHOP-12". */
export async function notifySubtaskAssigned(opts: { taskId: string; subtaskTitle: string; assigneeId: string | null | undefined; actorId: string }) {
  if (!opts.assigneeId || opts.assigneeId === opts.actorId) return
  try {
    const task = await loadTask(opts.taskId)
    if (!task) return
    const name = await actorName(opts.actorId)
    const key = `${task.project?.boardKey || "TASK"}-${task.taskNumber}`
    await notify({
      userId: opts.assigneeId,
      type: "TASK_ASSIGNED",
      title: `${name} gave you a subtask on ${key}`,
      body: opts.subtaskTitle,
      projectId: task.projectId,
      actionUrl: taskUrl(task.projectId, task.id),
      data: { taskId: task.id },
    })
  } catch (err) {
    console.error("[notify] subtask assigned failed:", err)
  }
}
