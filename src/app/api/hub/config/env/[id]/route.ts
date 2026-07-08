import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { encryptSecret } from "@/lib/crypto"

export const dynamic = "force-dynamic"

// PUT /api/hub/config/env/[id] — update a variable's value (and optionally name).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const existing = await prisma.environmentVariable.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const value = body.value !== undefined ? String(body.value) : undefined

    await prisma.environmentVariable.update({
      where: { id: params.id },
      data:
        value === undefined
          ? {}
          : existing.isSecret
          ? { valueEncrypted: encryptSecret(value) as any }
          : { valuePlain: value },
    })

    await prisma.auditLog.create({
      data: {
        action: existing.isSecret ? "secret.update" : "env.update",
        details: `Updated ${existing.isSecret ? "secret" : "env var"} ${existing.name}`,
        userId: auth.session!.user.id,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("PUT config env error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/config/env/[id]
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const existing = await prisma.environmentVariable.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.environmentVariable.delete({ where: { id: params.id } })
  await prisma.auditLog.create({
    data: {
      action: existing.isSecret ? "secret.delete" : "env.delete",
      details: `Deleted ${existing.isSecret ? "secret" : "env var"} ${existing.name}`,
      userId: auth.session!.user.id,
    },
  })

  return NextResponse.json({ ok: true })
}
