import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { canManageEnvVar } from "@/lib/hub-access"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export const dynamic = "force-dynamic"

// POST /api/hub/config/env/[id]/reveal — decrypt and return a secret's plaintext.
// Every reveal is written to the audit log so access to secrets is traceable.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const row = await prisma.environmentVariable.findUnique({ where: { id: params.id } })
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Revealing a value is as sensitive as changing it.
  if (!(await canManageEnvVar(auth.session!.user.id, row, "write"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let value = ""
  if (row.isSecret) {
    if (!row.valueEncrypted) return NextResponse.json({ error: "No stored value" }, { status: 400 })
    try {
      value = decryptSecret(row.valueEncrypted as any)
    } catch (err: any) {
      console.error("Secret decrypt error:", err)
      return NextResponse.json({ error: "Unable to decrypt (key mismatch?)" }, { status: 500 })
    }
  } else {
    value = row.valuePlain ?? ""
  }

  await prisma.auditLog.create({
    data: {
      action: "secret.reveal",
      details: `Revealed ${row.isSecret ? "secret" : "env var"} ${row.name}`,
      userId: auth.session!.user.id,
    },
  })

  return NextResponse.json({ value })
}
