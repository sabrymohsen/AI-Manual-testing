import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import type { ProjectPermission } from "@/lib/permissions"
import { Prisma, TaskStatus } from "@prisma/client"

/** Column definitions used when a project has no BoardColumn rows yet. */
export const DEFAULT_COLUMNS: { name: string; status: TaskStatus; order: number }[] = [
  { name: "To Do", status: "TODO", order: 0 },
  { name: "In Progress", status: "IN_PROGRESS", order: 1 },
  { name: "In Review", status: "REVIEW", order: 2 },
  { name: "Done", status: "DONE", order: 3 },
]

/** Ensure a project has board columns; lazily seed defaults on first read. */
export async function ensureBoardColumns(projectId: string) {
  const count = await prisma.boardColumn.count({ where: { projectId } })
  if (count === 0) {
    await prisma.boardColumn.createMany({
      data: DEFAULT_COLUMNS.map((c) => ({ ...c, projectId })),
    })
  }
  return prisma.boardColumn.findMany({ where: { projectId }, orderBy: { order: "asc" } })
}

const memberSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const

export const taskInclude = {
  epic: { select: { id: true, title: true, color: true } },
  assignees: { select: memberSelect },
  subtasks: { orderBy: { createdAt: "asc" } },
  _count: { select: { comments: true, testCaseLinks: true, bugLinks: true } },
} satisfies Prisma.TaskInclude

/** Minimal task shape embedded inside a link row (source/target). */
const linkedTaskSelect = {
  id: true,
  taskNumber: true,
  title: true,
  status: true,
  priority: true,
  type: true,
} as const

export const taskDetailInclude = {
  epic: { select: { id: true, title: true, color: true } },
  reporter: { select: memberSelect },
  assignees: { select: memberSelect },
  watchers: { select: memberSelect },
  votedBy: { select: { id: true } },
  subtasks: { orderBy: { createdAt: "asc" } },
  comments: {
    orderBy: { createdAt: "asc" },
    include: { author: { select: memberSelect } },
  },
  activities: {
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
  testCaseLinks: {
    include: { testCase: { select: { id: true, title: true, priority: true, executionType: true } } },
  },
  bugLinks: {
    include: { bugReport: { select: { id: true, bugKey: true, title: true, severity: true, status: true } } },
  },
  taskAttachments: {
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: memberSelect } },
  },
  workLogs: {
    orderBy: { startedAt: "desc" },
    include: { user: { select: memberSelect } },
  },
  linkedTasks: {
    include: { target: { select: linkedTaskSelect } },
  },
  linkedToTasks: {
    include: { source: { select: linkedTaskSelect } },
  },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude

/** The reciprocal phrasing shown on the *other* end of a directional link. */
export const INVERSE_LINK_TYPE: Record<string, string> = {
  blocks: "is blocked by",
  "is blocked by": "blocks",
  "relates to": "relates to",
  duplicates: "is duplicated by",
  "is duplicated by": "duplicates",
  clones: "is cloned by",
  "is cloned by": "clones",
}

const key = (boardKey: string | null | undefined, n: number) => `${boardKey || "TASK"}-${n}`

/** Attach the display key (BOARDKEY-number) and flatten counts + link joins. */
export function serializeTask(task: any, boardKey: string | null | undefined) {
  const {
    _count,
    testCaseLinks,
    bugLinks,
    taskAttachments,
    workLogs,
    linkedTasks,
    linkedToTasks,
    votedBy,
    ...rest
  } = task

  // Unified issue-link list. Outgoing links keep their stored phrasing; incoming
  // links are shown from this task's perspective via the inverse phrasing.
  const links = [
    ...(linkedTasks ?? []).map((l: any) => ({
      id: l.id,
      type: l.type,
      createdAt: l.createdAt,
      task: { ...l.target, key: key(boardKey, l.target.taskNumber) },
    })),
    ...(linkedToTasks ?? []).map((l: any) => ({
      id: l.id,
      type: INVERSE_LINK_TYPE[l.type] ?? l.type,
      createdAt: l.createdAt,
      task: { ...l.source, key: key(boardKey, l.source.taskNumber) },
    })),
  ]

  return {
    ...rest,
    key: key(boardKey, task.taskNumber),
    commentCount: _count?.comments ?? task.comments?.length ?? 0,
    testCaseCount: _count?.testCaseLinks ?? testCaseLinks?.length ?? 0,
    bugCount: _count?.bugLinks ?? bugLinks?.length ?? 0,
    testCases: testCaseLinks ? testCaseLinks.map((l: any) => l.testCase) : undefined,
    bugs: bugLinks ? bugLinks.map((l: any) => l.bugReport) : undefined,
    attachments: taskAttachments ?? undefined,
    workLogs: workLogs ?? undefined,
    links: linkedTasks || linkedToTasks ? links : undefined,
    votedByIds: votedBy ? votedBy.map((u: any) => u.id) : undefined,
  }
}

/**
 * Resolve a task by id and confirm the current session owns its project.
 * Returns the task's projectId + boardKey for downstream serialization, or an
 * error tuple mirroring the api-guards convention.
 */
/**
 * Gate access to a task by its parent project. Any project member (Owner /
 * Admin / Member / Viewer / Global Admin) passes; the resolved `permissions`
 * map is returned so callers can enforce finer checks (e.g. canDeleteStories
 * for deletes, canCreateStories for edits). The name is kept for the 13
 * existing callers; it now means "task access", not "task ownership".
 */
export async function requireTaskOwner(taskId: string): Promise<
  | { error: string; status: number; projectId: null; boardKey: null; userId: null; permissions: null }
  | {
      error: null
      status: 200
      projectId: string
      boardKey: string | null
      userId: string
      permissions: Record<ProjectPermission, boolean>
    }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, projectId: null, boardKey: null, userId: null, permissions: null }
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, project: { select: { boardKey: true } } },
  })
  if (!task) {
    return { error: "Task not found", status: 404, projectId: null, boardKey: null, userId: null, permissions: null }
  }
  const resolved = await resolveProjectRole(task.projectId, session.user.id)
  if (!resolved || resolved.role === null) {
    return { error: "Access denied", status: 404, projectId: null, boardKey: null, userId: null, permissions: null }
  }
  return {
    error: null,
    status: 200,
    projectId: task.projectId,
    boardKey: task.project.boardKey,
    userId: session.user.id,
    permissions: resolved.permissions,
  }
}

/** Log a task activity row (fire-and-forget style, but awaited for ordering). */
export async function logActivity(
  taskId: string,
  action: string,
  details: string | null,
  userId: string | null
) {
  return prisma.activity.create({ data: { taskId, action, details, userId } })
}
