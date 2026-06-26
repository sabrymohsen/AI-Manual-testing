/**
 * GET /api/projects/[projectId]/integrations/openproject/metadata
 *
 * Dynamic metadata loader — returns types, statuses, versions from the connected OpenProject instance.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: params.projectId },
  })

  if (!integration?.apiTokenEncrypted) {
    return NextResponse.json(
      { error: "OpenProject integration is not configured" },
      { status: 400 }
    )
  }

  let token: string
  try {
    token = decryptSecret({
      encrypted: integration.apiTokenEncrypted,
      iv: integration.apiTokenIv,
      authTag: integration.apiTokenAuthTag,
      keyVersion: integration.apiTokenKeyVersion,
    })
  } catch {
    return NextResponse.json({ error: "Failed to decrypt API token" }, { status: 500 })
  }

  try {
    const client = new OpenProjectClient(
      integration.baseUrl,
      integration.openProjectProjectIdentifier,
      token
    )

    const [types, statuses, versions, boards] = await Promise.allSettled([
      client.getTypes(),
      client.getStatuses(),
      client.getVersions(),
      client.getBoards(),
    ])

    return NextResponse.json({
      types: types.status === "fulfilled" ? types.value : [],
      statuses: statuses.status === "fulfilled" ? statuses.value : [],
      versions: versions.status === "fulfilled" ? versions.value : [],
      boards: boards.status === "fulfilled" ? boards.value : [],
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load metadata" },
      { status: 500 }
    )
  }
}
