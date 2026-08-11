/**
 * GET /api/projects/[projectId]/integrations/openproject/bug-fields
 *
 * Returns the required custom fields defined on the OpenProject bug type (with
 * allowed values for dropdowns), so the UI can collect them before syncing.
 */
import { NextResponse } from "next/server"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  // Member-level: these fields are required to file a bug.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { client, integration } = resolved

  try {
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
