/**
 * GET /api/projects/[projectId]/integrations/openproject/bug-fields
 *
 * Returns the required custom fields defined on the OpenProject bug type (with
 * allowed values for dropdowns), so the UI can collect them before syncing.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  requireProjectMember,
  requireProjectOwner,
  unauthorizedResponse,
  badRequestResponse,
} from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"
import { loadIntegration } from "@/lib/integrations/core/load-integration"

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
    // Project-level fallbacks used for any bug that has no value of its own.
    const loaded = await loadIntegration(params.projectId)
    const defaults = (loaded?.customFieldMapping as any)?.bugFieldDefaults ?? {}
    return NextResponse.json({ fields, bugTypeId, defaults })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load bug fields" }, { status: 500 })
  }
}

/**
 * PUT — save project-level default values for the required bug fields.
 *
 * Body: { defaults: { [fieldKey]: { kind, value } } } — the same shape stored on
 * a bug's own custom fields. Applied by every sync to fields the bug itself does
 * not set, which is what lets automatic syncs (auto-sync, a tracker rebuild)
 * satisfy required fields with nobody there to fill them in.
 */
export async function PUT(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  const defaults = body?.defaults
  if (!defaults || typeof defaults !== "object") {
    return badRequestResponse("defaults must be an object of { fieldKey: { kind, value } }")
  }

  const loaded = await loadIntegration(params.projectId)
  if (!loaded) return badRequestResponse("No OpenProject integration configured for this project")

  const customFieldMapping = { ...(loaded.customFieldMapping as any), bugFieldDefaults: defaults }
  if (loaded.source === "unified") {
    await prisma.projectIntegration.update({
      where: { projectId: params.projectId },
      data: { customFieldMapping },
    })
  } else {
    await prisma.openProjectIntegration.update({
      where: { projectId: params.projectId },
      data: { customFieldMapping },
    })
  }

  return NextResponse.json({ defaults })
}
