/**
 * POST /api/projects/[projectId]/integrations/openproject/apply-parent
 *
 * Bulk-update all synced test case WPs with the configured parent WP.
 * Validates parent before processing. Uses lockVersion for updates.
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

    const resolved = await resolveOpenProject(params.projectId)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { client, integration } = resolved

    if (!integration.defaultParentWorkPackageId) {
      return NextResponse.json({ error: "No default parent work package ID is configured" }, { status: 400 })
    }

    // Validate parent first
    const parentCheck = await client.validateParentWorkPackage(integration.defaultParentWorkPackageId)
    if (!parentCheck.valid) {
      return NextResponse.json(
        { error: `Parent validation failed: ${parentCheck.error}` },
        { status: 400 }
      )
    }

    // Load all synced test case mappings
    const mappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "TestCase",
      },
    })

    if (mappings.length === 0) {
      return NextResponse.json({ error: "No synced test cases found. Sync test cases first." }, { status: 400 })
    }

    // Create sync run
    const syncRun = await prisma.openProjectSyncRun.create({
      data: {
        projectId: params.projectId,
        operation: "apply-parent",
        status: "Running",
        totalCount: mappings.length,
        startedAt: new Date(),
      },
    })

    let linked = 0
    let alreadyLinked = 0
    let failed = 0
    const details: any[] = []
    const parentHref = client.parentHref(integration.defaultParentWorkPackageId)

    for (const mapping of mappings) {
      try {
        const wp = await client.getWorkPackage(mapping.externalId)
        const currentParentHref = wp._links?.parent?.href || null

        if (currentParentHref === parentHref) {
          alreadyLinked++
          details.push({ wpId: mapping.externalId, action: "already_linked" })
          continue
        }

        await client.updateWorkPackage(
          mapping.externalId,
          { _links: { parent: { href: parentHref } } },
          wp.lockVersion
        )

        linked++
        details.push({ wpId: mapping.externalId, action: "linked" })
      } catch (err: any) {
        failed++
        details.push({ wpId: mapping.externalId, action: "failed", error: err.message })
      }
    }

    // Update sync run
    await prisma.openProjectSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: failed > 0 && linked === 0 ? "Failed" : "Completed",
        updatedCount: linked,
        skippedCount: alreadyLinked,
        failedCount: failed,
        completedAt: new Date(),
        details: details as any,
      },
    })

    return NextResponse.json({
      syncRunId: syncRun.id,
      parentLinked: linked,
      alreadyLinked,
      failed,
      total: mappings.length,
      message: `Parent linked: ${linked} · Already linked: ${alreadyLinked} · Failed: ${failed}`,
    })
  } catch (err: any) {
    console.error("[op-apply-parent] Error:", err)
    return NextResponse.json({ error: err.message || "Failed to apply parent" }, { status: 500 })
  }
}
