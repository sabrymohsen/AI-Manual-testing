import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { encryptSecret } from "@/lib/crypto"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { roleName, username, password, loginUrl, notes } = body

  if (!roleName || !username || !password) {
    return NextResponse.json(
      { error: "Role name, username, and password are required" },
      { status: 400 }
    )
  }

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
