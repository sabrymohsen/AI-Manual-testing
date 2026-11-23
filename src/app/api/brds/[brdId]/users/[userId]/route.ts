import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { brdAudit, requireBrdAccess } from "@/lib/brd/server"
import { encryptPassword, publicUser, userSchema } from "@/lib/brd/test-users"

export const dynamic = "force-dynamic"

/** PATCH /api/brds/:brdId/users/:userId — an empty or missing password keeps the saved one. */
export async function PATCH(request: Request, { params }: { params: { brdId: string; userId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const existing = await prisma.brdTestUser.findFirst({ where: { id: params.userId, brdId: params.brdId } })
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 })
  const parsed = userSchema.partial().safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Check the fields" }, { status: 400 })
  const d = parsed.data
  if (d.key && d.key.toLowerCase() !== existing.key.toLowerCase()) {
    const clash = await prisma.brdTestUser.findFirst({ where: { brdId: params.brdId, key: { equals: d.key, mode: "insensitive" }, id: { not: existing.id } } })
    if (clash) return NextResponse.json({ error: `This BRD already has a user with the key "${d.key}"` }, { status: 409 })
  }
  const row = await prisma.brdTestUser.update({
    where: { id: existing.id },
    data: {
      ...(d.role !== undefined ? { role: d.role } : {}),
      ...(d.key ? { key: d.key } : {}),
      ...(d.username !== undefined ? { username: d.username } : {}),
      ...(d.password ? { passwordEncrypted: encryptPassword(d.password) } : {}),
      ...(d.loginUrl !== undefined ? { loginUrl: d.loginUrl || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  })
  await brdAudit(params.brdId, "test_user_updated", `Updated test user "${row.role}" (${row.key})${d.password ? ", new password" : ""}`, access.session!.user)
  return NextResponse.json({ user: publicUser(row) })
}

export async function DELETE(_req: Request, { params }: { params: { brdId: string; userId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const existing = await prisma.brdTestUser.findFirst({ where: { id: params.userId, brdId: params.brdId } })
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 })
  await prisma.brdTestUser.delete({ where: { id: existing.id } })
  await brdAudit(params.brdId, "test_user_removed", `Removed test user "${existing.role}" (${existing.key})`, access.session!.user)
  return NextResponse.json({ ok: true })
}
