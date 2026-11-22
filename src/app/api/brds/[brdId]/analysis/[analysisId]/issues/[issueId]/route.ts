import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdAccess } from "@/lib/brd/server"
import { resolveIssue } from "@/lib/brd/issue-resolution"

export const dynamic = "force-dynamic"

const schema = z.object({
  title: z.string().trim().min(1, "Give the user story a title").max(300),
  criteria: z.array(z.string().max(600)).min(1, "Add at least one acceptance criterion").max(8),
  /** false = accepted as drafted */
  edited: z.boolean().optional(),
  /** Also create the story on the Scrum board (default on). */
  toBoard: z.boolean().optional(),
})

/**
 * POST /api/brds/:brdId/analysis/:analysisId/issues/:issueId — accept (or
 * edit and accept) an issue's acceptance criteria: they become a user story.
 */
export async function POST(request: Request, { params }: { params: { brdId: string; analysisId: string; issueId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true, unlocked: true })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const owned = await prisma.brdAnalysis.findFirst({ where: { id: params.analysisId, brdId: params.brdId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid" }, { status: 400 })

  const toBoard = (parsed.data.toBoard ?? true) && access.resolved!.permissions.canCreateStories
  try {
    const resolution = await resolveIssue(
      params.analysisId,
      params.issueId,
      { title: parsed.data.title, criteria: parsed.data.criteria, edited: !!parsed.data.edited, toBoard },
      access.session!.user
    )
    return NextResponse.json({ resolution })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't save the criteria" }, { status: 409 })
  }
}
