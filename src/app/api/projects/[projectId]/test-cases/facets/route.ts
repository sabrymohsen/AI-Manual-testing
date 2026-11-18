import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { handleLibraryError } from "@/lib/test-cases/errors"
import { buildCaseWhere, parseCaseFilters } from "@/lib/test-cases/filters"

/**
 * GET /api/projects/:projectId/test-cases/facets
 *
 * Header counts for the test library, aggregated in the database.
 *
 * Accepts the same filter params as /browse. Each count is computed within
 * every OTHER active filter (suite, search, priority, type, tags, assignee,
 * plan) but ignores the status and trace chips themselves — so with a suite
 * selected, "3 failed" means 3 failed in that suite, and clicking it shows 3.
 * Previously these were always project-wide.
 *
 * Returns:
 *   total, byStatus, byPriority, byExecutionType, byReview,
 *   orphans  — cases covering no user story
 *   broken   — failed on its last run with no open bug tracking it
 *   bySuite  — [{ suiteId, count }] for the whole project (drives the tree)
 *   tags     — [{ tag, count }] for the whole project (drives the tag filter)
 *   assignees— [{ assignee, count }] for the whole project
 */
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }

  const projectId = params.projectId
  const p = new URL(request.url).searchParams

  try {
    const where = await buildCaseWhere(projectId, parseCaseFilters(p), {
      omit: ["statuses", "trace"],
      user: auth.session!.user,
    })
    const project = { projectId }

    const [total, byStatus, byPriority, byExecutionType, byReview, bySuite, orphans, broken, tags, assignees] =
      await Promise.all([
        prisma.testCase.count({ where }),
        prisma.testCase.groupBy({ by: ["lastStatus"], where, _count: { _all: true } }),
        prisma.testCase.groupBy({ by: ["priority"], where, _count: { _all: true } }),
        prisma.testCase.groupBy({ by: ["executionType"], where, _count: { _all: true } }),
        prisma.testCase.groupBy({ by: ["reviewState"], where, _count: { _all: true } }),
        prisma.testCase.groupBy({ by: ["suiteId"], where: project, _count: { _all: true } }),
        prisma.testCase.count({ where: { AND: [where, { requirements: { none: {} } }] } }),
        prisma.testCase.count({ where: { AND: [where, { lastStatus: "Failed", openBugCount: 0 }] } }),
        prisma.$queryRaw<{ tag: string; count: bigint }[]>`
          SELECT t AS tag, COUNT(*) AS count
          FROM "TestCase", unnest("tags") AS t
          WHERE "projectId" = ${projectId}
          GROUP BY t ORDER BY COUNT(*) DESC, t ASC LIMIT 200`,
        prisma.testCase.groupBy({ by: ["assignee"], where: project, _count: { _all: true } }),
      ])

    /**
     * groupBy rows → { value: count }. Prisma types `_count` as a union whose
     * shape depends on the argument, so the rows are read positionally.
     */
    const toMap = (rows: readonly any[], key: string): Record<string, number> =>
      Object.fromEntries(rows.map((r) => [String(r[key]), Number(r._count?._all ?? 0)]))

    return NextResponse.json({
      total,
      orphans,
      broken,
      byStatus: toMap(byStatus, "lastStatus"),
      byPriority: toMap(byPriority, "priority"),
      byExecutionType: toMap(byExecutionType, "executionType"),
      byReview: toMap(byReview, "reviewState"),
      bySuite: (bySuite as readonly any[]).map((r) => ({
        suiteId: (r.suiteId ?? null) as string | null,
        count: Number(r._count?._all ?? 0),
      })),
      tags: tags.map((t) => ({ tag: t.tag, count: Number(t.count) })),
      assignees: (assignees as readonly any[])
        .filter((r) => r.assignee)
        .map((r) => ({ assignee: r.assignee as string, count: Number(r._count?._all ?? 0) })),
    })
  } catch (err) {
    return handleLibraryError(err, "facets")
  }
}
