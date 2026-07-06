/**
 * POST /api/projects/[projectId]/integrations/openproject/features/[featureId]/test-connection
 *
 * Validates the effective connection config for a specific module.
 * Uses module override if present, falls back to project-level config.
 * Returns OpenProject types and statuses for the status-mapping dropdowns.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { decryptSecret } from "@/lib/crypto"
import { encryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

type Params = { params: { projectId: string; featureId: string } }

export async function POST(req: Request, { params }: Params) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  // Caller may pass an in-progress token (not yet saved) for testing
  const body = await req.json().catch(() => ({}))
  const inProgressToken: string | null = body.apiToken || null
  const inProgressBaseUrl: string | null = body.baseUrl || null
  const inProgressIdentifier: string | null = body.openProjectProjectIdentifier || null

  // Load module override
  const modCfg = await prisma.openProjectFeatureConfig.findUnique({
    where: { projectId_featureId: { projectId: params.projectId, featureId: params.featureId } },
  })

  // Load project-level config as fallback
  const projCfg = await prisma.openProjectIntegration.findUnique({
    where: { projectId: params.projectId },
  })

  // Resolve effective values (in-progress → module → project)
  let baseUrl = inProgressBaseUrl || modCfg?.baseUrl || projCfg?.baseUrl
  let identifier = inProgressIdentifier || modCfg?.openProjectProjectIdentifier || projCfg?.openProjectProjectIdentifier

  let token: string | null = null
  if (inProgressToken) {
    token = inProgressToken
  } else if (modCfg?.apiTokenEncrypted) {
    token = decryptSecret({
      encrypted: modCfg.apiTokenEncrypted,
      iv: modCfg.apiTokenIv!,
      authTag: modCfg.apiTokenAuthTag!,
      keyVersion: modCfg.apiTokenKeyVersion,
    })
  } else if (projCfg?.apiTokenEncrypted) {
    token = decryptSecret({
      encrypted: projCfg.apiTokenEncrypted,
      iv: projCfg.apiTokenIv,
      authTag: projCfg.apiTokenAuthTag,
      keyVersion: projCfg.apiTokenKeyVersion,
    })
  }

  if (!baseUrl || !identifier || !token) {
    return NextResponse.json(
      {
        success: false,
        message: "Missing connection details. Provide a base URL, project identifier, and API token (or inherit from project config).",
      },
      { status: 400 }
    )
  }

  // Normalize URL
  const urlMatch = baseUrl.trim().match(/^(https?:\/\/[^\/\?#]+)/)
  baseUrl = urlMatch ? urlMatch[1] : baseUrl.trim().replace(/\/$/, "")
  if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`

  // Normalize identifier
  const projMatch = identifier.trim().match(/\/projects\/([^\/\?#]+)/)
  identifier = projMatch ? projMatch[1] : identifier.trim().replace(/[\/\?#].*/g, "")

  const client = new OpenProjectClient(baseUrl, identifier, token)
  const result = await client.testConnection()

  // Persist connection status to module config
  if (modCfg) {
    await prisma.openProjectFeatureConfig.update({
      where: { projectId_featureId: { projectId: params.projectId, featureId: params.featureId } },
      data: {},
    })
  }

  return NextResponse.json(result)
}
