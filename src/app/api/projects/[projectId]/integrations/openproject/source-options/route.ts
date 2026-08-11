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
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  // Member-level: the Bug Source dropdown belongs to the bug form.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ field: null, options: [] })
  }
  const { client, integration } = resolved

  try {
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
