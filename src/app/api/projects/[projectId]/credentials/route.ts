import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { encryptSecret } from "@/lib/crypto"
import { createCredentialSchema } from "@/schemas"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createAuditLog } from "@/lib/auth/audit"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const credentials = await prisma.projectCredential.findMany({
    where: { projectId: params.projectId },
    select: {
      id: true,
      roleName: true,
      username: true,
      loginUrl: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ credentials })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = createCredentialSchema.safeParse(body)

  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }

  const { roleName, username, password, loginUrl, notes } = parsed.data

  const encrypted = encryptSecret(password)

  const credential = await prisma.projectCredential.create({
    data: {
      roleName,
      username,
      encryptedPassword: encrypted.encrypted,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      loginUrl,
      notes,
      projectId: params.projectId,
    },
  })

  await createAuditLog({
    action: "CREDENTIAL_CREATED",
    details: `Created credential "${roleName}" for project ${params.projectId}`,
    userId: auth.session!.user.id,
    projectId: params.projectId,
    credentialId: credential.id,
  })

  return NextResponse.json(
    {
      credential: {
        id: credential.id,
        roleName: credential.roleName,
        username: credential.username,
        loginUrl: credential.loginUrl,
        notes: credential.notes,
        createdAt: credential.createdAt,
      },
    },
    { status: 201 }
  )
}
