import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdTestAccess } from "@/lib/brd/server"
import { applyBrdAnalysis } from "@/lib/brd/analyze"
import { sendRequirementsToBoard, isEpicType, isStoryType } from "@/lib/brd/to-board"

export const dynamic = "force-dynamic"

const schema = z.object({
  candidateIds: z.array(z.string().max(64)).min(1, "Pick at least one requirement").max(1000),
  // Remove earlier auto-found requirements that have no linked tests and
  // aren't among the ones picked (e.g. table-of-contents lines a scan added).
  replaceAutoFound: z.boolean().optional(),
  // Also create the added epics and user stories on the Scrum board.
  sendToBoard: z.boolean().optional(),
})

/** POST /api/brds/:brdId/analysis/:analysisId/apply — add the reviewed suggestions. */
export async function POST(request: Request, { params }: { params: { brdId: string; analysisId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const owned = await prisma.brdAnalysis.findFirst({
    where: { id: params.analysisId, brdId: params.brdId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid" }, { status: 400 })

  try {
    const result = await applyBrdAnalysis(
      params.analysisId,
      parsed.data.candidateIds,
      { replaceAutoFound: parsed.data.replaceAutoFound },
      access.session!.user
    )
    let board = null
    if (parsed.data.sendToBoard) {
      if (!access.resolved!.permissions.canCreateStories) {
        return NextResponse.json({ ...result, boardError: "Missing permission: canCreateStories" })
      }
      const rows = await prisma.brdRequirement.findMany({
        where: { id: { in: result.requirementIds } },
        select: { id: true, type: true },
      })
      const ids = rows.filter((r) => isEpicType(r.type) || isStoryType(r.type)).map((r) => r.id)
      if (ids.length) board = await sendRequirementsToBoard(params.brdId, ids, access.session!.user)
    }
    return NextResponse.json({ ...result, board })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't add the requirements" }, { status: 409 })
  }
}
