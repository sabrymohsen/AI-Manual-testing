/**
 * GET  → the columns that would be created, and which OpenProject status backs
 *        each one. Reads only; nothing is created.
 * POST → create the bug-workflow board in OpenProject and (unless
 *        setAsDefault:false) point this project's bug sync at it.
 *
 * Body: { name?: string, setAsDefault?: boolean }
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"
import {
  createBugWorkflowBoard,
  planBugBoardColumns,
  resolveBugType,
} from "@/lib/integrations/openproject/create-bug-board"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  try {
    const statuses = await resolved.client.getStatuses()
    const plan = planBugBoardColumns(statuses.map((s) => ({ id: String(s.id), name: s.name })))
    const bugType = await resolveBugType(params.projectId, resolved.client)
    return NextResponse.json({
      columns: plan,
      bugTypeName: bugType?.name || null,
      trackerStatuses: statuses.map((s) => ({ id: String(s.id), name: s.name })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not read OpenProject statuses" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))

  try {
    const result = await createBugWorkflowBoard(params.projectId, {
      name: typeof body?.name === "string" ? body.name : undefined,
      setAsDefault: body?.setAsDefault !== false,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not create the board" }, { status: 500 })
  }
}
