import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdTestAccess, brdAudit } from "@/lib/brd/server"

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(10000).optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).nullable().optional(),
  // "active" accepts a change (the requirement's current wording is right);
  // "removed" retires it without losing its history.
  status: z.enum(["active", "removed"]).optional(),
})

async function load(brdId: string, reqId: string) {
  return prisma.brdRequirement.findFirst({ where: { id: reqId, brdId } })
}

/** PATCH edits a requirement, accepts a detected change, or retires it. */
export async function PATCH(request: Request, { params }: { params: { brdId: string; reqId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const req = await load(params.brdId, params.reqId)
  if (!req) return NextResponse.json({ error: "Requirement not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const d = parsed.data

  const requirement = await prisma.brdRequirement.update({
    where: { id: req.id },
    data: {
      ...d,
      ...(d.status === "active" ? { changedInVersion: null } : {}),
    },
  })
  if (d.status && d.status !== req.status) {
    await brdAudit(params.brdId, "requirement_status", `${req.key}: ${req.status} → ${d.status}`, access.session!.user)
  }
  return NextResponse.json({ requirement })
}

/** DELETE removes a requirement and its test-case links (the test cases stay). */
export async function DELETE(_req: Request, { params }: { params: { brdId: string; reqId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const req = await load(params.brdId, params.reqId)
  if (!req) return NextResponse.json({ error: "Requirement not found" }, { status: 404 })
  await prisma.brdRequirement.delete({ where: { id: req.id } })
  await brdAudit(params.brdId, "requirement_deleted", `${req.key}: ${req.title}`, access.session!.user)
  return NextResponse.json({ success: true })
}
