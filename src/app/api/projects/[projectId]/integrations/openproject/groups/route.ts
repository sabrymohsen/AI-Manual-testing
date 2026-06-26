/**
 * GET /api/projects/[projectId]/integrations/openproject/groups
 *
 * Returns all module groups with OpenProject sync status + per-module config state.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { getAllGroupsWithStatus } from "@/lib/integrations/openproject/openproject-group-sync"
import { prisma } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireProjectOwner(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    // Project-level integration
    const integration = await prisma.openProjectIntegration.findUnique({
      where: { projectId: params.projectId },
      select: {
        baseUrl: true,
        apiTokenEncrypted: true,
        testCaseTypeId: true,
        passedStatusId: true,
        failedStatusId: true,
        defaultStatusId: true,
        openProjectProjectIdentifier: true,
      },
    })

    const projConfigured = !!integration?.apiTokenEncrypted
    const projComplete = !!(
      integration?.apiTokenEncrypted &&
      integration.testCaseTypeId &&
      integration.defaultStatusId
    )

    // Per-module configs
    const moduleCfgs = await prisma.openProjectModuleConfig.findMany({
      where: { projectId: params.projectId },
    })
    const modCfgMap = new Map(moduleCfgs.map((c) => [c.moduleId, c]))

    const groups = await getAllGroupsWithStatus(params.projectId)

    // Attach per-module config status to each group
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
        moduleConfig: {
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
