import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission } from "@/lib/api-guards"
import { z } from "zod"
import { logActivity } from "@/lib/scrum/server"
import { logUserActivity } from "@/lib/user-activity"

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "REVIEW", "TESTING", "DEPLOYED"] as const
const PRIORITIES = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] as const
const TYPES = ["STORY", "TASK", "BUG", "TEST_CASE"] as const

type TaskStatus = (typeof STATUSES)[number]
type TaskPriority = (typeof PRIORITIES)[number]
type ImportType = (typeof TYPES)[number]

/** Loose header-cell values ("High", "critical", "P1"…) → TaskPriority. */
function normalizePriority(raw: string): TaskPriority | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "_")
  if ((PRIORITIES as readonly string[]).includes(v)) return v as TaskPriority
  const map: Record<string, TaskPriority> = {
    CRITICAL: "HIGHEST", BLOCKER: "HIGHEST", URGENT: "HIGHEST", P1: "HIGHEST",
    P2: "HIGH", MAJOR: "HIGH",
    NORMAL: "MEDIUM", P3: "MEDIUM",
    MINOR: "LOW", P4: "LOW",
    TRIVIAL: "LOWEST", P5: "LOWEST",
  }
  return map[v] ?? null
}

function normalizeStatus(raw: string): TaskStatus | null {
  const v = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  if ((STATUSES as readonly string[]).includes(v)) return v as TaskStatus
  const map: Record<string, TaskStatus> = {
    OPEN: "TODO", BACKLOG: "TODO", NEW: "TODO", TO_DO: "TODO",
    DOING: "IN_PROGRESS", WIP: "IN_PROGRESS", INPROGRESS: "IN_PROGRESS",
    IN_REVIEW: "REVIEW", CODE_REVIEW: "REVIEW",
    QA: "TESTING", TEST: "TESTING",
    CLOSED: "DONE", RESOLVED: "DONE", COMPLETE: "DONE", COMPLETED: "DONE",
  }
  return map[v] ?? null
}

function normalizeType(raw: string): ImportType | null {
  const v = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  if ((TYPES as readonly string[]).includes(v)) return v as ImportType
  const map: Record<string, ImportType> = {
    USER_STORY: "STORY", STORIES: "STORY",
    DEFECT: "BUG", ISSUE: "BUG",
    TEST: "TEST_CASE", TESTCASE: "TEST_CASE", TC: "TEST_CASE",
    CHORE: "TASK", TODO: "TASK",
  }
  return map[v] ?? null
}

const fileRowSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  storyPoints: z.union([z.number(), z.string()]).optional().nullable(),
  tags: z.string().optional().nullable(),
})

const importSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("file"),
    rows: z.array(fileRowSchema).min(1).max(1000),
    defaultType: z.enum(TYPES).default("STORY"),
    sprintId: z.string().optional().nullable(),
    epicId: z.string().optional().nullable(),
  }),
  z.object({
    source: z.literal("testCases"),
    testCaseIds: z.array(z.string()).min(1).max(500),
    sprintId: z.string().optional().nullable(),
    epicId: z.string().optional().nullable(),
  }),
])

// TestCase.priority (Low/Medium/High/Critical) → TaskPriority
const TC_PRIORITY: Record<string, TaskPriority> = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Critical: "HIGHEST",
}

/**
 * GET /api/projects/:projectId/scrum/tasks/import
 * Picker source for the board's Import modal: the project's test cases,
 * flagged when a scrum task already links to them.
 */
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const testCases = await prisma.testCase.findMany({
    where: { projectId: params.projectId },
    select: {
      id: true,
      title: true,
      priority: true,
      executionType: true,
      tags: true,
      scrumTaskLinks: { select: { taskId: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  return NextResponse.json({
    testCases: testCases.map(({ scrumTaskLinks, ...tc }) => ({
      ...tc,
      alreadyImported: scrumTaskLinks.length > 0,
    })),
  })
}

/**
 * POST /api/projects/:projectId/scrum/tasks/import
 * Bulk-creates scrum tasks either from spreadsheet rows (user stories etc.)
 * or from existing project test cases (created as linked TEST_CASE tasks).
 */
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data
  const userId = auth.session.user.id

  // Validate sprint/epic targets belong to this project.
  const sprintId = data.sprintId || null
  const epicId = data.epicId || null
  if (sprintId) {
    const sprint = await prisma.scrumSprint.findFirst({ where: { id: sprintId, projectId: params.projectId } })
    if (!sprint) return NextResponse.json({ error: "Sprint not found in this project" }, { status: 400 })
  }
  if (epicId) {
    const epic = await prisma.scrumEpic.findFirst({ where: { id: epicId, projectId: params.projectId } })
    if (!epic) return NextResponse.json({ error: "Epic not found in this project" }, { status: 400 })
  }

  const skipped: { row: number; title: string; reason: string }[] = []
  let created = 0

  if (data.source === "file") {
    // Rank counters per status so imported tasks land at the bottom of columns.
    const rankByStatus = new Map<TaskStatus, number>()
    const nextRank = async (status: TaskStatus) => {
      if (!rankByStatus.has(status)) {
        const last = await prisma.task.aggregate({
          where: { projectId: params.projectId, status },
          _max: { boardRank: true },
        })
        rankByStatus.set(status, last._max.boardRank ?? -1)
      }
      const rank = rankByStatus.get(status)! + 1
      rankByStatus.set(status, rank)
      return rank
    }

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i]
      const rowNum = i + 2 // header row is 1
      const title = row.title?.trim()
      if (!title) {
        skipped.push({ row: rowNum, title: "", reason: "Missing title" })
        continue
      }
      if (title.length > 300) {
        skipped.push({ row: rowNum, title: title.slice(0, 60), reason: "Title longer than 300 characters" })
        continue
      }

      const type = (row.type && normalizeType(row.type)) || data.defaultType
      const priority = (row.priority && normalizePriority(row.priority)) || "MEDIUM"
      const status = (row.status && normalizeStatus(row.status)) || "TODO"
      const pointsNum = row.storyPoints === null || row.storyPoints === undefined || row.storyPoints === ""
        ? null
        : Number(row.storyPoints)
      const storyPoints = pointsNum !== null && Number.isFinite(pointsNum) && pointsNum >= 0 ? pointsNum : null
      const tags = (row.tags ?? "")
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)

      const task = await prisma.task.create({
        data: {
          projectId: params.projectId,
          title,
          description: row.description?.trim() || null,
          type,
          status,
          priority,
          storyPoints,
          sprintId,
          epicId,
          tags,
          reporterId: userId,
          boardRank: await nextRank(status),
        },
      })
      await logActivity(task.id, "created", "Imported from file", userId)
      created++
    }
  } else {
    const testCases = await prisma.testCase.findMany({
      where: { id: { in: data.testCaseIds }, projectId: params.projectId },
      select: {
        id: true,
        title: true,
        priority: true,
        preconditions: true,
        tags: true,
        steps: { orderBy: { stepNumber: "asc" }, select: { actionDescription: true, expectedResult: true } },
        scrumTaskLinks: { select: { taskId: true }, take: 1 },
      },
    })
    const found = new Set(testCases.map((tc) => tc.id))
    data.testCaseIds
      .filter((id) => !found.has(id))
      .forEach((id) => skipped.push({ row: 0, title: id, reason: "Test case not found in this project" }))

    const last = await prisma.task.aggregate({
      where: { projectId: params.projectId, status: "TODO" },
      _max: { boardRank: true },
    })
    let rank = last._max.boardRank ?? -1

    for (const tc of testCases) {
      if (tc.scrumTaskLinks.length > 0) {
        skipped.push({ row: 0, title: tc.title, reason: "Already linked to a board task" })
        continue
      }

      // Carry the test case's substance into the task description.
      const stepLines = tc.steps
        .map((s, i) => `${i + 1}. ${s.actionDescription}${s.expectedResult ? ` → ${s.expectedResult}` : ""}`)
        .join("\n")
      const description = [
        tc.preconditions ? `Preconditions:\n${tc.preconditions}` : null,
        stepLines ? `Steps:\n${stepLines}` : null,
      ]
        .filter(Boolean)
        .join("\n\n") || null

      const task = await prisma.task.create({
        data: {
          projectId: params.projectId,
          title: tc.title,
          description,
          type: "TEST_CASE",
          status: "TODO",
          priority: TC_PRIORITY[tc.priority] ?? "MEDIUM",
          sprintId,
          epicId,
          tags: tc.tags,
          reporterId: userId,
          boardRank: ++rank,
          testCaseLinks: { create: { testCaseId: tc.id } },
        },
      })
      await logActivity(task.id, "created", "Imported from Test Cases", userId)
      created++
    }
  }

  if (created > 0) {
    logUserActivity(
      userId,
      "TASK_CREATED",
      `Imported ${created} ${created === 1 ? "issue" : "issues"} to the scrum board`,
      params.projectId
    )
  }

  return NextResponse.json({ created, skipped }, { status: 201 })
}
