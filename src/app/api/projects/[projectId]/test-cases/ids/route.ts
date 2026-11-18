import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { handleLibraryError } from "@/lib/test-cases/errors"
import { buildCaseWhere, parseCaseFilters, MAX_BULK_IDS } from "@/lib/test-cases/filters"

/**
 * GET /api/projects/:projectId/test-cases/ids
 *
 * Every case id matching the library filters (same params as /browse), for
 * "select all N matching". The list only loads 50 rows at a time, so the
 * header checkbox alone used to bulk-run or delete just the loaded page.
 * Capped at MAX_BULK_IDS; `truncated` says when the cap was hit.
 */
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }
  try {
    const where = await buildCaseWhere(params.projectId, parseCaseFilters(new URL(request.url).searchParams), {
      user: auth.session!.user,
    })
    const rows = await prisma.testCase.findMany({
      where,
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_BULK_IDS + 1,
    })
    const truncated = rows.length > MAX_BULK_IDS
    return NextResponse.json({ ids: rows.slice(0, MAX_BULK_IDS).map((r) => r.id), truncated })
  } catch (err) {
    return handleLibraryError(err, "ids")
  }
}
