/**
 * POST /api/bug-reports/[bugId]/sync/openproject
 *
 * Sync/retry a bug report to OpenProject as a work package.
 */
import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { syncBugReportToOpenProject } from "@/lib/integrations/openproject/sync-bug-report"
import { prisma } from "@/lib/db"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    // Persist the current parent/board/column selections FIRST (when supplied) so
    // the sync uses them atomically — this avoids a race where a just-edited field
    // hadn't been saved yet, which previously dropped the parent/board on sync.
    const body = await request.json().catch(() => ({}))
    const placement: Record<string, any> = {}
    if (body.parentId !== undefined) placement.openProjectParentId = body.parentId || null
    if (body.boardId !== undefined) placement.openProjectBoardId = body.boardId || null
    if (body.boardColumnId !== undefined) placement.openProjectBoardColumnId = body.boardColumnId || null
    if (body.customFields !== undefined) placement.openProjectCustomFields = body.customFields || null
    if (Object.keys(placement).length > 0) {
      await prisma.bugReport.update({ where: { id: params.bugId }, data: placement })
    }

    const result = await syncBugReportToOpenProject(params.bugId)

    if (result.status === "skipped") {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }

    return NextResponse.json({
      action: result.status,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    })
  } catch (err: any) {
    const message = err?.message || "Bug sync failed"
    const status = message === "Bug report not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
