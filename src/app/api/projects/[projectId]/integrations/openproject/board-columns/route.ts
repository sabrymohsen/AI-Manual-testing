/**
 * GET /api/projects/[projectId]/integrations/openproject/board-columns?boardId=xxx
 *
 * Returns the columns of a specific OpenProject board by reading its grid widgets.
 */
import { NextResponse } from "next/server"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  // Member-level: picking a placement column is part of filing a bug.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  const boardId = searchParams.get("boardId")

  if (!boardId || isNaN(Number(boardId))) {
    return NextResponse.json({ error: "boardId query param is required" }, { status: 400 })
  }

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  try {
    const columns = await resolved.client.getBoardColumns(Number(boardId))
    return NextResponse.json({ columns })
  } catch (err: any) {
    return NextResponse.json({ columns: [], error: err?.message || String(err) }, { status: 200 })
  }
}
