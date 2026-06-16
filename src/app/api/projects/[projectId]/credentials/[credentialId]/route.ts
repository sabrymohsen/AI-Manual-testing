import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { encryptSecret } from "@/lib/crypto"

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; credentialId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const updateData: any = {}

  if (body.roleName) updateData.roleName = body.roleName
  if (body.username) updateData.username = body.username
  if (body.loginUrl !== undefined) updateData.loginUrl = body.loginUrl
  if (body.notes !== undefined) updateData.notes = body.notes

  if (body.password) {
    const encrypted = encryptSecret(body.password)
    updateData.encryptedPassword = encrypted.encrypted
    updateData.encryptionIv = encrypted.iv
    updateData.encryptionAuthTag = encrypted.authTag
    updateData.keyVersion = encrypted.keyVersion
  }

  const credential = await prisma.projectCredential.update({
    where: { id: params.credentialId },
    data: updateData,
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  await prisma.projectCredential.delete({
    where: { id: params.credentialId },
  })

  return NextResponse.json({ success: true })
}
