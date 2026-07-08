import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { encryptSecret } from "@/lib/crypto"

export const dynamic = "force-dynamic"

// GET /api/hub/config/env — list environment variables + secrets.
// Secret values are never returned here; the client shows a masked placeholder
// and must call the reveal endpoint (which audits access) to see the plaintext.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const rows = await prisma.environmentVariable.findMany({ orderBy: { name: "asc" } })

  return NextResponse.json({
    variables: rows.map((r) => ({
      id: r.id,
      name: r.name,
      value: r.isSecret ? null : r.valuePlain ?? "",
      masked: r.isSecret,
      scope: r.scope,
      isSecret: r.isSecret,
      projectId: r.projectId,
      // Whether this name is currently resolvable from the running process env.
      liveInProcess: process.env[r.name] !== undefined,
      updatedAt: r.updatedAt,
    })),
  })
}

// POST /api/hub/config/env — create a variable or secret.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || "").trim()
    const value = String(body.value ?? "")
    const scope = body.scope === "project" ? "project" : "global"
    const isSecret = Boolean(body.isSecret)
    const projectId = scope === "project" ? body.projectId || null : null

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return NextResponse.json({ error: "Name must be a valid env var identifier (A-Z, 0-9, _)" }, { status: 400 })
    }

    const created = await prisma.environmentVariable.create({
      data: {
        name,
        scope,
        isSecret,
        projectId,
        valuePlain: isSecret ? null : value,
        valueEncrypted: isSecret ? (encryptSecret(value) as any) : undefined,
        createdBy: auth.session!.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: isSecret ? "secret.create" : "env.create",
        details: `Created ${isSecret ? "secret" : "env var"} ${name} (${scope})`,
        userId: auth.session!.user.id,
      },
    })

    return NextResponse.json({ id: created.id })
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "A variable with that name/scope already exists" }, { status: 409 })
    }
    console.error("POST config env error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
