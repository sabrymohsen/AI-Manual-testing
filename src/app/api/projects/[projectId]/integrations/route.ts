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

  // Verify project owner
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: session.user.id }
  })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const config = await prisma.integrationConfig.findUnique({
    where: { projectId: params.projectId }
  })

  return NextResponse.json({
    integration: {
      provider: config?.provider || "none",
      enabled: config?.enabled || false,
      host: config?.host || "",
      projectKey: config?.projectKey || "",
      username: config?.username || "",
      triggerOn: config?.triggerOn || "Failed",
      hasToken: !!config?.encryptedToken
    }
  })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Verify project owner
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: session.user.id }
  })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const { provider, enabled, host, projectKey, username, token, triggerOn } = body

  if (!provider) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 })
  }

  let tokenData: Record<string, string> = {}
  if (token) {
    try {
      const encrypted = encryptSecret(token)
      tokenData = {
        encryptedToken: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        encryptionAuthTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion
      }
    } catch (err) {
      console.error("Encryption failed:", err)
      return NextResponse.json({ error: "Failed to encrypt credentials" }, { status: 500 })
    }
  }

  const config = await prisma.integrationConfig.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      provider,
      enabled: !!enabled,
      host: host || null,
      projectKey: projectKey || null,
      username: username || null,
      triggerOn: triggerOn || "Failed",
      ...tokenData
    },
    update: {
      provider,
      enabled: !!enabled,
      host: host || null,
      projectKey: projectKey || null,
      username: username || null,
      triggerOn: triggerOn || "Failed",
      ...tokenData
    }
  })

  return NextResponse.json({
    integration: {
      provider: config.provider,
      enabled: config.enabled,
      host: config.host || "",
      projectKey: config.projectKey || "",
      username: config.username || "",
      triggerOn: config.triggerOn,
      hasToken: !!config.encryptedToken
    }
  })
}
