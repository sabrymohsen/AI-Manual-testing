import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveProjectRole } from "@/lib/api-guards"
import { requireHubProject } from "@/lib/hub-access"
import { newToken } from "@/lib/hub-ci"

export const dynamic = "force-dynamic"

/** A CI token runs code on the server unattended: project Owners/Admins only. */
async function canManageTokens(projectId: string, userId: string) {
  const r = await resolveProjectRole(projectId, userId)
  return !!r && (r.role === "Owner" || r.role === "Admin" || r.globalRole === "Admin")
}

// GET /api/hub/ci-tokens?projectId= — tokens (never their values)
export async function GET(request: NextRequest) {
  const auth = await requireHubProject(request.nextUrl.searchParams.get("projectId"), "read")
  if (!auth.ok) return auth.response
  const tokens = await prisma.hubTriggerToken.findMany({
    where: { projectId: auth.projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdByName: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  })
  return NextResponse.json({ tokens, canManage: await canManageTokens(auth.projectId, auth.session.user.id) })
}

// POST /api/hub/ci-tokens { projectId, name } — returns the token ONCE.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(String(body.projectId || ""), "write")
  if (!auth.ok) return auth.response
  if (!(await canManageTokens(auth.projectId, auth.session.user.id))) {
    return NextResponse.json({ error: "Only project Owners and Admins can create CI tokens" }, { status: 403 })
  }
  const name = String(body.name || "").trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: "Name the token, e.g. GitHub Actions" }, { status: 400 })

  const { token, hash, prefix } = newToken()
  const row = await prisma.hubTriggerToken.create({
    data: {
      projectId: auth.projectId,
      name,
      tokenHash: hash,
      prefix,
      createdById: auth.session.user.id,
      createdByName: auth.session.user.name || auth.session.user.email,
    },
    select: { id: true, name: true, prefix: true, createdAt: true },
  })
  return NextResponse.json({ token: { ...row, value: token } }, { status: 201 })
}
