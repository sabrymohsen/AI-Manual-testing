import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { handleLibraryError } from "@/lib/test-cases/errors"

/**
 * GET /api/projects/:projectId/test-cases/facets
 *
 * Header counts and per-suite tallies for the test library, aggregated in the
 * database. The page previously derived these by filtering the full in-memory
 * array four times per render.
 *
 * Returns:
 *   total, byStatus, byPriority, byExecutionType,
 *   orphans  — cases covering no user story
 *   broken   — never executed, or failed with no bug filed
 *   bySuite  — [{ suiteId, count }], suiteId null = unfiled
 */
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }

  const projectId = params.projectId
  const where = { projectId }

  try {
  const [total, byStatus, byPriority, byExecutionType, bySuite, orphans, broken] = await Promise.all([
    prisma.testCase.count({ where }),
    prisma.testCase.groupBy({ by: ["lastStatus"], where, _count: { _all: true } }),
    prisma.testCase.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    prisma.testCase.groupBy({ by: ["executionType"], where, _count: { _all: true } }),
    prisma.testCase.groupBy({ by: ["suiteId"], where, _count: { _all: true } }),
    prisma.testCase.count({ where: { ...where, requirements: { none: {} } } }),
    prisma.testCase.count({
      where: {
        ...where,
        OR: [{ lastStatus: "NotExecuted" }, { AND: [{ lastStatus: "Failed" }, { openBugCount: 0 }] }],
      },
    }),
  ])

  /**
   * groupBy rows → { value: count }.
   *
   * Prisma types `_count` as a union whose shape depends on the argument, so a
   * generic `{ _count: { _all: number } }[]` signature doesn't line up. The
   * rows are read positionally here, so a local widening is honest and keeps
   * the four call sites identical.
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
    bySuite: (bySuite as readonly any[]).map((r) => ({
      suiteId: (r.suiteId ?? null) as string | null,
      count: Number(r._count?._all ?? 0),
    })),
  })
  } catch (err) {
    return handleLibraryError(err, "facets")
  }
}
