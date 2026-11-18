import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveProjectRole } from "@/lib/api-guards"
import { requireHubProject } from "@/lib/hub-access"

// DELETE /api/hub/ci-tokens/{id} — revoke (kept for the audit trail).
export async function DELETE(_request: NextRequest, { params }: { params: { tokenId: string } }) {
  const row = await prisma.hubTriggerToken.findUnique({ where: { id: params.tokenId } })
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const auth = await requireHubProject(row.projectId, "write")
  if (!auth.ok) return auth.response
  const r = await resolveProjectRole(row.projectId, auth.session.user.id)
  if (!r || !(r.role === "Owner" || r.role === "Admin" || r.globalRole === "Admin")) {
    return NextResponse.json({ error: "Only project Owners and Admins can revoke CI tokens" }, { status: 403 })
  }
  await prisma.hubTriggerToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
  return NextResponse.json({ revoked: true })
}
