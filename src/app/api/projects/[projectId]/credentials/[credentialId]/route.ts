import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { encryptSecret } from "@/lib/crypto"
import { createAuditLog } from "@/lib/auth/audit"

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; credentialId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const updateCredentialSchema = z.object({
    roleName: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    loginUrl: z.string().url().optional().nullable(),
    notes: z.string().optional().nullable(),
    password: z.string().optional(),
  })
  const parsed = updateCredentialSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const updateData: any = {}

  if (parsed.data.roleName) updateData.roleName = parsed.data.roleName
  if (parsed.data.username) updateData.username = parsed.data.username
  if (parsed.data.loginUrl !== undefined) updateData.loginUrl = parsed.data.loginUrl
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

  if (parsed.data.password) {
    const encrypted = encryptSecret(parsed.data.password)
    updateData.encryptedPassword = encrypted.encrypted
    updateData.encryptionIv = encrypted.iv
    updateData.encryptionAuthTag = encrypted.authTag
    updateData.keyVersion = encrypted.keyVersion
  }

  const credential = await prisma.projectCredential.update({
    where: { id: params.credentialId, projectId: params.projectId },
    data: updateData,
  })

  await createAuditLog({
    action: "CREDENTIAL_UPDATED",
    details: `Updated credential "${credential.roleName}" for project ${params.projectId}`,
    userId: auth.session!.user.id,
    projectId: params.projectId,
    credentialId: credential.id,
  })

  return NextResponse.json({
    credential: {
      id: credential.id,
      roleName: credential.roleName,
      username: credential.username,
      loginUrl: credential.loginUrl,
      notes: credential.notes,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; credentialId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const credential = await prisma.projectCredential.findFirst({
    where: { id: params.credentialId, projectId: params.projectId },
  })
  if (!credential) {
    return notFoundResponse("Credential not found")
  }

  await prisma.projectCredential.delete({
    where: { id: params.credentialId, projectId: params.projectId },
  })

  await createAuditLog({
    action: "CREDENTIAL_DELETED",
    details: `Deleted credential "${credential.roleName}" from project ${params.projectId}`,
    userId: auth.session!.user.id,
    projectId: params.projectId,
    credentialId: credential.id,
  })

  return NextResponse.json({ success: true })
}
