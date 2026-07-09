/**
 * GET /api/projects/[projectId]/integrations/openproject/source-options
 *
 * Returns the allowed values (titles) of the OpenProject list custom field that
 * represents a bug's "Source" (auto-detected by a name matching /source/i on the
 * bug type). Used to populate the app-side "Bug Source" dropdown in bug
 * create/edit — the chosen value is stored on BugReport.source, NOT synced back.
 * No-op ({ options: [] }) when the integration isn't configured or no such field
 * exists, so the UI degrades gracefully.
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
    return NextResponse.json({ field: null, options: [] })
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
    return NextResponse.json({ field: null, options: [] })
  }

  try {
    const client = new OpenProjectClient(
      integration.baseUrl,
      integration.openProjectProjectIdentifier,
      token
    )

    let bugTypeId = integration.bugTypeId
    if (!bugTypeId) {
      const types = await client.getTypes()
      const bugType = types.find(t => t.name.toLowerCase() === "bug")
      bugTypeId = bugType ? String(bugType.id) : null
    }
    if (!bugTypeId) return NextResponse.json({ field: null, options: [] })

    const fields = await client.getTypeCustomFields(bugTypeId, { onlyRequired: false })
    // Prefer a list field whose name mentions "source"; fall back to an exact
    // "source" match. Only list/dropdown fields (with allowed values) qualify.
    const sourceField =
      fields.find(f => /source/i.test(f.name) && f.allowedValues.length > 0) ||
      fields.find(f => f.name.trim().toLowerCase() === "source")

    const options = (sourceField?.allowedValues || [])
      .map(v => v.title)
      .filter((t): t is string => !!t && t.trim() !== "")

    return NextResponse.json({ field: sourceField?.name || null, options })
  } catch (err: any) {
    return NextResponse.json({ field: null, options: [], error: err?.message }, { status: 200 })
  }
}
