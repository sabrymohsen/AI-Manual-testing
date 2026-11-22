import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdAccess, requireBrdTestAccess, brdAudit } from "@/lib/brd/server"
import { loadGate, recordOverride } from "@/lib/brd/questions"

export const dynamic = "force-dynamic"

/** GET /api/brds/:brdId/gate — is this BRD ready for test design? */
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  return NextResponse.json({ gate: await loadGate(params.brdId) })
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("override"), why: z.string().trim().min(5, "Say why you are proceeding (at least a few words).").max(2000) }),
  z.object({ action: z.literal("withdraw") }),
])

/**
 * POST /api/brds/:brdId/gate
 *   { action: "override", why } — a tester proceeds with test design although
 *      blocking questions are open. Who/why/when are recorded and every test
 *      generated meanwhile is labelled "tester-override".
 *   { action: "withdraw" } — removes the override.
 */
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 })
  const user = access.session!.user

  if (parsed.data.action === "override") {
    await recordOverride(params.brdId, parsed.data.why, user)
  } else {
    await prisma.brdDocument.update({
      where: { id: params.brdId },
      data: { gateOverrideAt: null, gateOverrideById: null, gateOverrideByName: null, gateOverrideWhy: null },
    })
    await brdAudit(params.brdId, "gate_override_withdrawn", null, user)
  }
  return NextResponse.json({ gate: await loadGate(params.brdId) })
}
