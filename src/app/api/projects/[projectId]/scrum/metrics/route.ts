import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

/**
 * GET /api/projects/:projectId/scrum/metrics
 *
 * Scrum work-item counts for the dashboard: how many user stories sit in each
 * board column, plus a breakdown by issue type.
 *
 * Aggregated with groupBy rather than fetching tasks and counting client-side,
 * which is the pattern the existing dashboard metric hooks use — they pull the
 * full test-case and bug lists just to produce four numbers.
 */

const STATUS_KEYS = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING", "DEPLOYED", "DONE"] as const
const TYPE_KEYS = ["STORY", "TASK", "BUG", "TEST_CASE", "SUBTASK", "EPIC"] as const

/** Statuses that count as still open, for the "remaining" headline. */
const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING"] as const

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }

  const projectId = params.projectId

  const [storiesByStatus, byType, storyPoints, activeSprint] = await Promise.all([
    prisma.task.groupBy({
      by: ["status"],
      where: { projectId, type: "STORY" },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["type"],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.task.aggregate({
      where: { projectId, type: "STORY" },
      _sum: { storyPoints: true },
    }),
    prisma.scrumSprint.findFirst({
      where: { projectId, status: "ACTIVE" },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
  ])

  // Zero-fill so the UI always renders every column, including empty ones —
  // "0 in Testing" is information; a missing chip is not.
  const byStatus = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0])) as Record<string, number>
  for (const row of storiesByStatus as readonly any[]) {
    byStatus[String(row.status)] = Number(row._count?._all ?? 0)
  }

  const typeCounts = Object.fromEntries(TYPE_KEYS.map((k) => [k, 0])) as Record<string, number>
  for (const row of byType as readonly any[]) {
    typeCounts[String(row.type)] = Number(row._count?._all ?? 0)
  }

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const open = OPEN_STATUSES.reduce((sum, k) => sum + byStatus[k], 0)
  const done = byStatus.DONE + byStatus.DEPLOYED

  return NextResponse.json({
    stories: {
      total,
      open,
      done,
      byStatus,
      // Percent complete by count. Guarded so an empty project reads 0, not NaN.
      completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
      totalPoints: storyPoints._sum.storyPoints ?? 0,
    },
    byType: typeCounts,
    activeSprint,
  })
}
