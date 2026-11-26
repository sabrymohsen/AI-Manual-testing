import { notifyTaskAssigned } from "@/lib/scrum/notifications"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { withNextTaskNumber } from "@/lib/scrum/task-number"
import { requireProjectMember, requireProjectPermission } from "@/lib/api-guards"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { taskInclude, serializeTask, logActivity } from "@/lib/scrum/server"
import { loadBoardSignals } from "@/lib/scrum/board-signals"
import { logUserActivity } from "@/lib/user-activity"

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "REVIEW", "TESTING", "DEPLOYED"] as const
const PRIORITIES = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] as const
const TYPES = ["STORY", "TASK", "BUG", "TEST_CASE", "SUBTASK", "EPIC"] as const

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  type: z.enum(TYPES).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  // Task.storyPoints is a Float and the estimation scale offers 0.5, so this
  // must NOT be .int() — that rejected every half-point estimate with a 400.
  storyPoints: z.number().min(0).max(999).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  branchName: z.string().optional().nullable(),
  sprintId: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  // Jira-style columns that already exist on Task but were never accepted at
  // create time — the type-specific create forms populate these.
  environment: z.string().optional().nullable(),
  components: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  affectedVersions: z.array(z.string()).optional(),
})

// GET /api/projects/:projectId/scrum/tasks?status=&priority=&assignee=&sprint=&epic=&search=&sort=
export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const statuses = url.searchParams.getAll("status").filter((s) => (STATUSES as readonly string[]).includes(s))
  const priorities = url.searchParams.getAll("priority").filter((p) => (PRIORITIES as readonly string[]).includes(p))
  const assignees = url.searchParams.getAll("assignee").filter(Boolean)
  const sprint = url.searchParams.get("sprint") || undefined
  const epic = url.searchParams.get("epic") || undefined
  const search = url.searchParams.get("search")?.trim() || undefined
  const sort = url.searchParams.get("sort") || "boardRank"

  const where: Prisma.TaskWhereInput = { projectId: params.projectId }
  if (statuses.length) where.status = { in: statuses as any }
  if (priorities.length) where.priority = { in: priorities as any }
  if (assignees.length) where.assignees = { some: { id: { in: assignees } } }
  if (sprint) where.sprintId = sprint
  if (epic) where.epicId = epic
  if (search) {
    const asNum = Number(search.replace(/^\D+/, ""))
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      ...(Number.isFinite(asNum) && asNum > 0 ? [{ taskNumber: asNum }] : []),
    ]
  }

  const orderBy: Prisma.TaskOrderByWithRelationInput =
    sort === "priority" ? { priority: "desc" }
    : sort === "dueDate" ? { dueDate: "asc" }
    : sort === "title" ? { title: "asc" }
    : sort === "createdAt" ? { createdAt: "desc" }
    : { boardRank: "asc" }

  const [project, tasks] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.projectId }, select: { boardKey: true } }),
    prisma.task.findMany({ where, orderBy, include: taskInclude }),
  ])

  const signals = await loadBoardSignals(tasks.map((t) => t.id))
  return NextResponse.json({
    tasks: tasks.map((t) => ({ ...serializeTask(t, project?.boardKey), signals: signals.get(t.id) })),
  })
}

// POST /api/projects/:projectId/scrum/tasks
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data

  // New task drops at the bottom of its column.
  const status = data.status ?? "TODO"
  const last = await prisma.task.aggregate({
    where: { projectId: params.projectId, status },
    _max: { boardRank: true },
  })

  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { boardKey: true } })

  const task = await withNextTaskNumber(params.projectId, (taskNumber) =>
        prisma.task.create({
    data: {
          taskNumber,
      projectId: params.projectId,
      title: data.title,
      description: data.description ?? null,
      type: data.type ?? "STORY",
      status,
      priority: data.priority ?? "MEDIUM",
      storyPoints: data.storyPoints ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      branchName: data.branchName ?? null,
      sprintId: data.sprintId ?? null,
      epicId: data.epicId ?? null,
      tags: data.tags ?? [],
      environment: data.environment ?? null,
      components: data.components ?? [],
      labels: data.labels ?? [],
      affectedVersions: data.affectedVersions ?? [],
      boardRank: (last._max.boardRank ?? -1) + 1,
      assignees: data.assigneeIds?.length ? { connect: data.assigneeIds.map((id) => ({ id })) } : undefined,
    },
    include: taskInclude,
  }))

  await logActivity(task.id, "created", `Task created in ${status}`, auth.session.user.id)
  logUserActivity(auth.session.user.id, "TASK_CREATED", `Created "${task.title}"`, params.projectId)

  // Notify assignees added at creation time (excluding the creator).
  if (data.assigneeIds?.length) {
    await notifyTaskAssigned({ taskId: task.id, actorId: auth.session.user.id, userIds: data.assigneeIds })
  }

  return NextResponse.json({ task: serializeTask(task, project?.boardKey) }, { status: 201 })
}
