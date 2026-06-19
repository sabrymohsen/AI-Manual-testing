import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createIntegrationConfigSchema } from "@/schemas"
import { z } from "zod"
import { encryptSecret } from "@/lib/crypto"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const integrationSchema = createIntegrationConfigSchema.extend({
    token: z.string().optional(),
  })
  const parsed = integrationSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const { provider, enabled, host, projectKey, username, token, triggerOn } = parsed.data

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
