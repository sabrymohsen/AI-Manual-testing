/**
 * POST /api/projects/[projectId]/integrations/openproject/sync-to-board
 *
 * Apply board-visibility fields (status, type, parent, version) to synced WPs.
 * Does NOT call a board API — applies the fields needed for board filters.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireProjectMember(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    // Resolve from whichever row owns the config (unified ProjectIntegration
    // first, legacy OpenProjectIntegration second).
    const resolved = await resolveOpenProject(params.projectId)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { client, integration } = resolved

    // Load all synced test case mappings
    const mappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "TestCase",
      },
    })

    if (mappings.length === 0) {
      return NextResponse.json({ error: "No synced test cases found" }, { status: 400 })
    }

    // Create sync run
    const syncRun = await prisma.openProjectSyncRun.create({
      data: {
        projectId: params.projectId,
        operation: "sync-to-board",
        status: "Running",
        totalCount: mappings.length,
        startedAt: new Date(),
      },
    })

    let boardUpdated = 0
    let alreadyReady = 0
    let failed = 0
    const details: any[] = []

    for (const mapping of mappings) {
      try {
        const wp = await client.getWorkPackage(mapping.externalId)

        // Build update _links based on what's configured
        const updateLinks: Record<string, { href: string }> = {}
        let needsUpdate = false

        // Type
        if (integration.testCaseTypeId) {
          const currentTypeHref = wp._links?.type?.href || ""
          const desiredTypeHref = client.typeHref(integration.testCaseTypeId)
          if (!currentTypeHref.includes(desiredTypeHref)) {
            updateLinks.type = { href: desiredTypeHref }
            needsUpdate = true
          }
        }

        // Status
        if (integration.defaultStatusId) {
          const currentStatusHref = wp._links?.status?.href || ""
          const desiredStatusHref = client.statusHref(integration.defaultStatusId)
          if (!currentStatusHref.includes(desiredStatusHref)) {
            updateLinks.status = { href: desiredStatusHref }
            needsUpdate = true
          }
        }

        // Parent (for parent-child board)
        if (integration.boardStrategy === "ParentChildBased" && integration.defaultParentWorkPackageId) {
          const currentParentHref = wp._links?.parent?.href || ""
          const desiredParentHref = client.parentHref(integration.defaultParentWorkPackageId)
          if (!currentParentHref.includes(desiredParentHref)) {
            updateLinks.parent = { href: desiredParentHref }
            needsUpdate = true
          }
        }

        // Version (for version board)
        if (integration.boardStrategy === "VersionBased" && integration.targetVersionId) {
          const currentVersionHref = wp._links?.version?.href || ""
          const desiredVersionHref = client.versionHref(integration.targetVersionId)
          if (!currentVersionHref.includes(desiredVersionHref)) {
            updateLinks.version = { href: desiredVersionHref }
            needsUpdate = true
          }
        }

        if (needsUpdate) {
          await client.updateWorkPackage(
            mapping.externalId,
            { _links: updateLinks },
            wp.lockVersion
          )
          boardUpdated++
          details.push({ wpId: mapping.externalId, action: "updated" })
        } else {
          alreadyReady++
          details.push({ wpId: mapping.externalId, action: "already_ready" })
        }
      } catch (err: any) {
        failed++
        details.push({ wpId: mapping.externalId, action: "failed", error: err.message })
      }
    }

    // Update sync run
    await prisma.openProjectSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: failed > 0 && boardUpdated === 0 ? "Failed" : "Completed",
        updatedCount: boardUpdated,
        skippedCount: alreadyReady,
        failedCount: failed,
        completedAt: new Date(),
        details: details as any,
      },
    })

    return NextResponse.json({
      syncRunId: syncRun.id,
      boardUpdated,
      alreadyReady,
      failed,
      total: mappings.length,
      message: `Board-ready updated: ${boardUpdated} · Already ready: ${alreadyReady} · Failed: ${failed}`,
    })
  } catch (err: any) {
    console.error("[op-sync-to-board] Error:", err)
    return NextResponse.json({ error: err.message || "Sync to board failed" }, { status: 500 })
  }
}
