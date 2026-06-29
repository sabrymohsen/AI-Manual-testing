/**
 * POST /api/bug-reports/[bugId]/sync/openproject
 *
 * Sync/retry a bug report to OpenProject as a work package.
 */
import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { syncBugReportToOpenProject } from "@/lib/integrations/openproject/sync-bug-report"

export async function POST(
  _request: Request,
  { params }: { params: { bugId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
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
