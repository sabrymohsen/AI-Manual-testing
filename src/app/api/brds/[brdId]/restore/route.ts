import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import { brdAudit } from "@/lib/brd/server"
import { TRASH_DAYS } from "@/lib/brd/lifecycle"

/**
 * POST /api/brds/:brdId/restore — brings a deleted BRD back from the trash.
 * (requireBrdAccess deliberately treats deleted BRDs as missing, so this
 * route resolves access itself.)
 */
export async function POST(_req: Request, { params }: { params: { brdId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const brd = await prisma.brdDocument.findUnique({ where: { id: params.brdId } })
  if (!brd || !brd.isDeleted) return NextResponse.json({ error: "Not in the trash" }, { status: 404 })
  const resolved = await resolveProjectRole(brd.projectId, session.user.id)
  if (!resolved?.role) return NextResponse.json({ error: "Not in the trash" }, { status: 404 })
  if (!resolved.permissions.canManageBrds) {
    return NextResponse.json({ error: "Missing permission: canManageBrds" }, { status: 403 })
  }
  if (brd.deletedAt && Date.now() - brd.deletedAt.getTime() > TRASH_DAYS * 86_400_000) {
    return NextResponse.json({ error: "This BRD was deleted more than 30 days ago" }, { status: 410 })
  }

  await prisma.brdDocument.update({ where: { id: brd.id }, data: { isDeleted: false, deletedAt: null } })
  await brdAudit(brd.id, "restored", `Restored "${brd.name}" from the trash`, session.user)
  return NextResponse.json({ success: true })
}
