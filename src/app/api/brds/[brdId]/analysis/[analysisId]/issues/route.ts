import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdAccess } from "@/lib/brd/server"
import { draftIssueCriteria } from "@/lib/brd/issue-resolution"

export const dynamic = "force-dynamic"

const schema = z.object({ issueIds: z.array(z.string().max(64)).max(500).optional() }).optional()

/**
 * POST /api/brds/:brdId/analysis/:analysisId/issues — draft acceptance
 * criteria for the unresolved issues ({ issueIds } for some of them).
 */
export async function POST(request: Request, { params }: { params: { brdId: string; analysisId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const owned = await prisma.brdAnalysis.findFirst({ where: { id: params.analysisId, brdId: params.brdId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  try {
    const r = await draftIssueCriteria(params.analysisId, parsed.data?.issueIds ?? null, access.session!.user)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't draft the criteria" }, { status: 500 })
  }
}
