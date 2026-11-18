import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { Prisma } from "@prisma/client"
import { handleLibraryError } from "@/lib/test-cases/errors"
import { buildCaseWhere, parseCaseFilters } from "@/lib/test-cases/filters"

/**
 * GET /api/projects/:projectId/test-cases/browse
 *
 * The test library list, filtered / sorted / paginated **in the database**.
 *
 * Replaces the pattern where the page fetched every test case (with every
 * step), every TestRun and every BugReport in the project and joined them in
 * the browser on each render. That was only possible because "last status"
 * didn't exist in Postgres; the rollup columns added in
 * 20260802000000_test_suites_and_execution_rollup are what make this endpoint
 * expressible at all.
 *
 * Returns summary rows only — no steps. Steps come from the detail endpoint
 * when a case is actually selected.
 *
 * Query params
 *   q              free text over title + preconditions
 *   suite          suite id (includes its sub-suites), or "unfiled"
 *   status         repeatable — TestCaseStatus
 *   priority       repeatable — Priority
 *   executionType  Manual | Automated
 *   tag            repeatable — matches any
 *   trace          orphans | broken
 *   plan           test plan id — only cases in that plan
 *   review         repeatable — Draft | Ready | Approved | Deprecated
 *   assignee       repeatable — team member id, "me" or "unassigned"
 *   sort           updatedAt | createdAt | title | priority | lastRunAt | estimatedMinutes
 *   dir            asc | desc                                            (default desc)
 *   cursor         id of the last row from the previous page
 *   limit          1..100                                                (default 50)
 */

const SORTABLE = ["updatedAt", "createdAt", "title", "priority", "lastRunAt", "estimatedMinutes"] as const

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  // Reads are member-level. This route deliberately does NOT use
  // requireProjectOwner: that guard demands Owner/Admin, which meant ordinary
  // project members got a 404 when listing test cases.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }

  const url = new URL(request.url)
  const p = url.searchParams

  const sortRaw = p.get("sort") ?? "updatedAt"
  const sort = (SORTABLE as readonly string[]).includes(sortRaw) ? sortRaw : "updatedAt"
  const dir: Prisma.SortOrder = p.get("dir") === "asc" ? "asc" : "desc"

  const cursor = p.get("cursor") || undefined
  const limit = Math.min(Math.max(Number(p.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  let where: Prisma.TestCaseWhereInput
  try {
    where = await buildCaseWhere(params.projectId, parseCaseFilters(p), { user: auth.session!.user })
  } catch (err) {
    return handleLibraryError(err, "browse")
  }

  // `title` and `priority` are not unique, so pair every sort with id to keep
  // cursor pagination stable — otherwise rows can repeat or vanish across pages.
  const orderBy: Prisma.TestCaseOrderByWithRelationInput[] = [
    sort === "estimatedMinutes" || sort === "lastRunAt"
      ? ({ [sort]: { sort: dir, nulls: "last" } } as any)
      : ({ [sort]: dir } as any),
    { id: "asc" },
  ]

  try {
    return await listCases()
  } catch (err) {
    return handleLibraryError(err, "browse")
  }

  async function listCases() {
  // Total only on the first page — it drives "select all N matching".
  const total = cursor ? undefined : await prisma.testCase.count({ where })
  const rows = await prisma.testCase.findMany({
    where,
    orderBy,
    take: limit + 1, // one extra to detect a further page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      priority: true,
      source: true,
      executionType: true,
      tags: true,
      assignee: true,
      reviewState: true,
      estimatedMinutes: true,
      lastStatus: true,
      lastRunAt: true,
      lastRunId: true,
      lastRunSource: true,
      openBugCount: true,
      createdAt: true,
      updatedAt: true,
      suite: { select: { id: true, name: true } },
      _count: { select: { requirements: true, steps: true } },
    },
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // Sync state for just this page — one query, not one per row.
  const syncRows = page.length
    ? await prisma.externalSyncMapping.findMany({
        where: {
          projectId: params.projectId,
          localEntityType: "TestCase",
          localEntityId: { in: page.map((r) => r.id) },
        },
        select: { localEntityId: true, externalId: true, externalUrl: true, lastSyncStatus: true },
      })
    : []
  const syncById = new Map(syncRows.map((s) => [s.localEntityId, s]))

  return NextResponse.json({
    rows: page.map(({ _count, ...r }) => ({
      ...r,
      requirementCount: _count.requirements,
      stepCount: _count.steps,
      isOrphan: _count.requirements === 0,
      sync: syncById.get(r.id) ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  })
  }
}
