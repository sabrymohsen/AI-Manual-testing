import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireBrdAccess, brdAudit } from "@/lib/brd/server"

// DELETE /api/brds/:brdId/links/:linkId -> unlink an Epic or Story
export async function DELETE(_req: Request, { params }: { params: { brdId: string; linkId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true, unlocked: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })

  const link = await prisma.brdLink.findFirst({ where: { id: params.linkId, brdId: params.brdId } })
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  await prisma.brdLink.delete({ where: { id: link.id } })
  await brdAudit(params.brdId, "link_removed", `Unlinked ${link.linkType}: ${link.label}`, access.session!.user)

  return NextResponse.json({ success: true })
}
