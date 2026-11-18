import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { notify } from "@/lib/notifications"
import { z } from "zod"
import {
  requireBrdAccess,
  brdAudit,
  brdDetailInclude,
  serializeBrd,
  BRD_STATUSES,
} from "@/lib/brd/server"

// GET /api/brds/:brdId -> full detail (versions, links, audit)
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const [project, brd] = await Promise.all([
    prisma.project.findUnique({ where: { id: access.brd!.projectId }, select: { boardKey: true } }),
    prisma.brdDocument.findUnique({ where: { id: params.brdId }, include: brdDetailInclude }),
  ])
  return NextResponse.json({
    brd: serializeBrd(brd, project?.boardKey),
    canManage: access.resolved!.permissions.canManageBrds,
    // Testers can track requirements and link/generate test cases even when
    // they can't edit the document itself.
    canTest: access.resolved!.permissions.canManageBrds || access.resolved!.permissions.canCreateStories,
  })
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(BRD_STATUSES).optional(),
})

// PATCH /api/brds/:brdId -> rename or change status
export async function PATCH(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const d = parsed.data

  // Final means locked: only the status itself may change (to unlock it).
  if (brd.status === "Final" && d.name && d.name !== brd.name && !(d.status && d.status !== "Final")) {
    return NextResponse.json({ error: "This BRD is Final and locked. Change its status first." }, { status: 403 })
  }

  const updated = await prisma.brdDocument.update({
    where: { id: brd.id },
    data: { ...(d.name ? { name: d.name } : {}), ...(d.status ? { status: d.status } : {}) },
  })

  if (d.name && d.name !== brd.name) {
    await brdAudit(brd.id, "renamed", `Renamed to "${d.name}"`, user)
  }
  if (d.status && d.status !== brd.status) {
    await brdAudit(brd.id, "status_changed", `${brd.status} → ${d.status}`, user)
    if (d.status === "Final") {
      const project = await prisma.project.findUnique({
        where: { id: brd.projectId },
        select: { userId: true, projectMembers: { select: { userId: true } } },
      })
      if (project) {
        const recipients = [
          ...new Set([project.userId, ...project.projectMembers.map((m) => m.userId)]),
        ].filter((id) => id !== user.id)
        notify(
          recipients.map((userId) => ({
            userId,
            type: "SYSTEM" as const,
            title: "BRD marked Final",
            body: `BRD ${brd.name} is now final`,
            projectId: brd.projectId,
            actionUrl: `/projects/${brd.projectId}/brds/${brd.id}`,
          }))
        ).catch(() => {})
      }
    }
  }

  return NextResponse.json({ brd: { id: updated.id, name: updated.name, status: updated.status } })
}

// DELETE /api/brds/:brdId -> soft delete (30-day retention window)
export async function DELETE(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!

  await prisma.brdDocument.update({
    where: { id: brd.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })
  await brdAudit(brd.id, "deleted", `Deleted BRD: ${brd.name}`, access.session!.user)

  return NextResponse.json({ success: true })
}
