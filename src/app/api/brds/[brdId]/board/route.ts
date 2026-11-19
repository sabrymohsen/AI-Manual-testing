import { NextResponse } from "next/server"
import { z } from "zod"
import { requireBrdAccess } from "@/lib/brd/server"
import { sendRequirementsToBoard } from "@/lib/brd/to-board"

export const dynamic = "force-dynamic"

const schema = z.object({
  // Omit to send every epic and user story of the BRD.
  requirementIds: z.array(z.string().max(64)).min(1, "Pick at least one requirement").max(1000).optional(),
})

/**
 * POST /api/brds/:brdId/board { requirementIds? }
 * Creates the BRD's epics and user stories on the project's Scrum board (backlog).
 * Requirements already on the board are skipped.
 */
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.resolved!.permissions.canCreateStories) {
    return NextResponse.json({ error: "Missing permission: canCreateStories" }, { status: 403 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid" }, { status: 400 })

  const result = await sendRequirementsToBoard(access.brd!.id, parsed.data.requirementIds ?? null, access.session!.user)
  return NextResponse.json(result, { status: result.storiesCreated || result.epicsCreated ? 201 : 200 })
}
