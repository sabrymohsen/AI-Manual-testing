/**
 * GET /api/projects/[projectId]/integrations/openproject/bug-fields
 *
 * Returns the required custom fields defined on the OpenProject bug type (with
 * allowed values for dropdowns), so the UI can collect them before syncing.
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
    return NextResponse.json({ error: "OpenProject integration is not configured" }, { status: 400 })
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

    // Resolve the bug type: configured id, else a type named "Bug".
    let bugTypeId = integration.bugTypeId
    if (!bugTypeId) {
      const types = await client.getTypes()
      const bugType = types.find(t => t.name.toLowerCase() === "bug")
      bugTypeId = bugType ? String(bugType.id) : null
    }
    if (!bugTypeId) {
      return NextResponse.json({ fields: [], bugTypeId: null })
    }

    const fields = await client.getTypeCustomFields(bugTypeId, { onlyRequired: true })
    return NextResponse.json({ fields, bugTypeId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load bug fields" }, { status: 500 })
  }
}
