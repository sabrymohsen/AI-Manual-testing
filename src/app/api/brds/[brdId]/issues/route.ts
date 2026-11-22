import { NextResponse } from "next/server"
import { requireBrdAccess } from "@/lib/brd/server"
import { pendingResolutions, writeResolutionsToBrd } from "@/lib/brd/issue-resolution"

export const dynamic = "force-dynamic"

/** GET /api/brds/:brdId/issues — how many saved criteria aren't in the document yet. */
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const pending = await pendingResolutions(params.brdId)
  return NextResponse.json({ pending: pending.length, fileType: access.brd!.fileType })
}

/** POST /api/brds/:brdId/issues — write the saved criteria into the BRD as a new version. */
export async function POST(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true, unlocked: true })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  try {
    const r = await writeResolutionsToBrd(params.brdId, access.session!.user)
    return NextResponse.json(r, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't update the BRD" }, { status: 409 })
  }
}
