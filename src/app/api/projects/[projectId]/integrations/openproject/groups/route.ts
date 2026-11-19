/**
 * GET /api/projects/[projectId]/integrations/openproject/groups
 *
 * Returns all feature groups with OpenProject sync status + per-feature config state.
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { getAllGroupsWithStatus } from "@/lib/integrations/openproject/openproject-group-sync"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"
import { prisma } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireProjectMember(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    // Project-level integration — from whichever row owns it (unified or legacy)
    const resolved = await resolveOpenProject(params.projectId)
    const integration = resolved.ok
      ? { ...resolved.integration, apiTokenEncrypted: true as const }
      : null

    const projConfigured = !!integration?.apiTokenEncrypted
    const projComplete = !!(
      integration?.apiTokenEncrypted &&
      integration.testCaseTypeId &&
      integration.defaultStatusId
    )

    // Per-feature configs
    const featureCfgs = await prisma.openProjectFeatureConfig.findMany({
      where: { projectId: params.projectId },
    })
    const modCfgMap = new Map(featureCfgs.map((c) => [c.featureId, c]))

    const groups = await getAllGroupsWithStatus(params.projectId)

    // Attach per-feature config status to each group
    const groupsWithConfig = groups.map((g) => {
      const mod = modCfgMap.get(g.groupId)

      const effectiveBaseUrl = mod?.baseUrl || integration?.baseUrl || null
      const effectiveIdentifier = mod?.openProjectProjectIdentifier || integration?.openProjectProjectIdentifier || null
      const effectiveHasToken = !!(mod?.apiTokenEncrypted || integration?.apiTokenEncrypted)
      const effectivePassedId = mod?.passedStatusId || integration?.passedStatusId || null
      const effectiveFailedId = mod?.failedStatusId || integration?.failedStatusId || null
      const effectiveDefaultId = mod?.defaultStatusId || integration?.defaultStatusId || null

      const isComplete = !!(
        effectiveBaseUrl &&
        effectiveHasToken &&
        effectiveIdentifier &&
        (effectivePassedId || effectiveFailedId || effectiveDefaultId)
      )

      return {
        ...g,
        featureConfig: {
          hasOwnConfig: !!mod,
          configured: projConfigured || !!(mod?.apiTokenEncrypted),
          complete: isComplete,
          lastSyncStatus: mod?.lastSyncStatus ?? null,
          lastSyncError: mod?.lastSyncError ?? null,
          lastSyncAt: mod?.lastSyncAt?.toISOString() ?? null,
        },
      }
    })

    return NextResponse.json({
      groups: groupsWithConfig,
      integration: { configured: projConfigured, complete: projComplete },
    })
  } catch (err: any) {
    console.error("[op-groups] Error:", err)
    return NextResponse.json({ error: err.message || "Failed to load groups" }, { status: 500 })
  }
}
