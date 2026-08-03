/**
 * POST /api/bug-reports/[bugId]/sync
 *
 * Provider-neutral bug sync — pushes the bug to whichever tracker the project is
 * connected to (Jira / Azure DevOps / ClickUp / OpenProject). The legacy
 * .../sync/openproject route remains as a back-compat alias; both delegate to the
 * same provider-agnostic engine (syncBugReport).
 */
import { NextResponse } from "next/server"
import { syncBugReport } from "@/lib/integrations/core/sync-bug-report"
import { authorizeBugWrite } from "@/lib/bug-reports/guards"
import { prisma } from "@/lib/db"

export async function POST(request: Request, { params }: { params: { bugId: string } }) {
  // This route is addressed by bug id with no project in the path. It used to
  // check only requireAuth(), so any authenticated user could write placement
  // fields onto any bug in any project and push it to that project's tracker.
  const auth = await authorizeBugWrite(params.bugId)
  if (!auth.ok) return auth.response

  try {
    // Persist any parent/board/column/custom-field selections first so the sync
    // uses them atomically (fields are stored on the OpenProject-named columns,
    // which the engine reads provider-agnostically).
    const body = await request.json().catch(() => ({}))
    const placement: Record<string, any> = {}
    if (body.parentId !== undefined) placement.openProjectParentId = body.parentId || null
    if (body.boardId !== undefined) placement.openProjectBoardId = body.boardId || null
    if (body.boardColumnId !== undefined) placement.openProjectBoardColumnId = body.boardColumnId || null
    if (body.customFields !== undefined) placement.openProjectCustomFields = body.customFields || null
    if (Object.keys(placement).length > 0) {
      await prisma.bugReport.update({ where: { id: params.bugId }, data: placement })
    }

    const result = await syncBugReport(params.bugId)
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
