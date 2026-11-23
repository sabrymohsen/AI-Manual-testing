import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { brdAudit, requireBrdAccess } from "@/lib/brd/server"
import { asList } from "@/lib/brd/generation-context"
import { encryptPassword, publicUser, suggestRoles, userKey, userSchema } from "@/lib/brd/test-users"

export const dynamic = "force-dynamic"

/**
 * GET /api/brds/:brdId/users → this BRD's test users (no passwords), the roles
 * its requirements mention that have no user yet, and whether the caller may edit.
 */
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const [users, reqs] = await Promise.all([
    prisma.brdTestUser.findMany({ where: { brdId: params.brdId }, orderBy: { createdAt: "asc" } }),
    prisma.brdRequirement.findMany({ where: { brdId: params.brdId, status: { not: "removed" } }, select: { title: true, description: true, acceptanceCriteria: true } }),
  ])
  const have = new Set(users.map((u) => u.role.trim().toLowerCase()))
  const suggestions = suggestRoles(reqs.flatMap((r) => [r.title, r.description, ...asList(r.acceptanceCriteria)])).filter((r) => !have.has(r.toLowerCase()))
  return NextResponse.json({ users: users.map(publicUser), suggestions, canManage: !!access.resolved?.permissions.canManageBrds })
}

/** POST /api/brds/:brdId/users { role, key?, username, password?, loginUrl?, notes? } */
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const parsed = userSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Check the fields" }, { status: 400 })
  const d = parsed.data
  const taken = (await prisma.brdTestUser.findMany({ where: { brdId: params.brdId }, select: { key: true } })).map((u) => u.key)
  if (d.key && taken.some((k) => k.toLowerCase() === d.key!.toLowerCase())) {
    return NextResponse.json({ error: `This BRD already has a user with the key "${d.key}"` }, { status: 409 })
  }
  const user = access.session!.user
  const row = await prisma.brdTestUser.create({
    data: {
      brdId: params.brdId,
      role: d.role,
      key: d.key || userKey(d.role, taken),
      username: d.username,
      passwordEncrypted: d.password ? encryptPassword(d.password) : undefined,
      loginUrl: d.loginUrl || null,
      notes: d.notes || null,
      createdById: user.id,
      createdByName: user.name || user.email || null,
    },
  })
  await brdAudit(params.brdId, "test_user_added", `Added test user "${row.role}" (${row.key})`, user)
  return NextResponse.json({ user: publicUser(row) }, { status: 201 })
}
