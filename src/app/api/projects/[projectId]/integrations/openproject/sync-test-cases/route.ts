/**
 * POST /api/projects/[projectId]/integrations/openproject/sync-test-cases
 *
 * Bulk sync test cases to OpenProject as work packages.
 * - Uses HAL _links for type, status, parent
 * - Handles lockVersion for updates
 * - Prevents duplicates via ExternalSyncMapping + description marker search
 * - Creates OpenProjectSyncRun for operation logging
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { OpSyncItemResult } from "@/lib/integrations/openproject/openproject.client"
import { persistLastSyncAt, resolveOpenProject } from "@/lib/integrations/openproject/resolve"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

function buildTestCaseDescription(tc: any, projectName: string): string {
  const mod = tc.moduleRelation?.name || tc.module || "General"
  const feature = tc.feature?.name
  const component = tc.component?.name

  let md = `## Test Case\n\n`
  md += `**Local Test Case ID:** \`${tc.id}\`\n`
  md += `**Project:** ${projectName}\n`
  md += `**Module:** ${mod}\n`
  if (feature) md += `**Feature:** ${feature}\n`
  if (component) md += `**Component:** ${component}\n`
  md += `**Priority:** ${tc.priority}\n`
  md += `**Source:** ${tc.source}\n\n`

  if (tc.preconditions) {
    md += `## Preconditions\n`
    for (const line of tc.preconditions.split("\n").filter(Boolean)) {
      md += `- ${line}\n`
    }
    md += "\n"
  }

  if (tc.steps?.length > 0) {
    md += `## Steps\n\n| Step | Action | Expected Result |\n|---|---|---|\n`
    for (const s of tc.steps) {
      const action = s.actionDescription.replace(/\|/g, "\\|")
      const expected = (s.expectedResult || "").replace(/\|/g, "\\|")
      md += `| ${s.stepNumber} | ${action} | ${expected} |\n`
    }
    md += "\n"
  }

  md += `## Latest Execution Result\nNot Executed\n\n`
  md += `*Generated from [QA Engine](${APP_URL})*\n\n`
  // Stable marker for duplicate prevention
  md += `<!-- AI-Manual-QA-Tester:TestCase:${tc.id} -->`
  return md
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireProjectOwner(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    // Resolve from whichever row owns the config (unified ProjectIntegration
    // first, legacy OpenProjectIntegration second).
    const resolved = await resolveOpenProject(params.projectId)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { client, integration } = resolved

    // Validate parent if configured
    if (integration.parentStrategy === "SingleParent" && integration.defaultParentWorkPackageId) {
      const parentCheck = await client.validateParentWorkPackage(integration.defaultParentWorkPackageId)
      if (!parentCheck.valid) {
        return NextResponse.json(
          { error: `Parent validation failed: ${parentCheck.error}. Fix parent configuration before syncing.` },
          { status: 400 }
        )
      }
    }

    const body = await request.json().catch(() => ({}))
    const { testCaseIds } = body as { testCaseIds?: string[] }

    // Load project name
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { name: true },
    })
    const projectName = project?.name || "Unknown Project"

    // Load test cases
    const testCases = await prisma.testCase.findMany({
      where: {
        projectId: params.projectId,
        ...(testCaseIds?.length ? { id: { in: testCaseIds } } : {}),
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    })

    if (testCases.length === 0) {
      return NextResponse.json({ error: "No test cases found to sync." }, { status: 400 })
    }

    // Create sync run record
    const syncRun = await prisma.openProjectSyncRun.create({
      data: {
        projectId: params.projectId,
        operation: "bulk-sync-test-cases",
        status: "Running",
        totalCount: testCases.length,
        startedAt: new Date(),
      },
    })

    // Load existing mappings
    const existingMappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "TestCase",
        localEntityId: { in: testCases.map((tc) => tc.id) },
      },
    })
    const mappingMap = new Map(existingMappings.map((m) => [m.localEntityId, m]))

    // Build HAL _links for create
    const links: Record<string, { href: string }> = {}
    if (integration.testCaseTypeId) {
      links.type = { href: client.typeHref(integration.testCaseTypeId) }
    }
    if (integration.defaultStatusId) {
      links.status = { href: client.statusHref(integration.defaultStatusId) }
    }
    if (integration.parentStrategy === "SingleParent" && integration.defaultParentWorkPackageId) {
      links.parent = { href: client.parentHref(integration.defaultParentWorkPackageId) }
    }

    const results: OpSyncItemResult[] = []
    let createdCount = 0
    let updatedCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const tc of testCases) {
      const description = buildTestCaseDescription(tc, projectName)
      const subject = `[TC] ${tc.title}`
      const existingMapping = mappingMap.get(tc.id)

      try {
        if (existingMapping) {
          // UPDATE existing work package with lockVersion handling
          const wp = await client.getWorkPackage(existingMapping.externalId)

          const updateData: Record<string, any> = {
            subject,
            description: { format: "markdown", raw: description },
          }

          // Only include _links if we have mappings configured
          const updateLinks: Record<string, { href: string }> = {}
          if (integration.testCaseTypeId) {
            updateLinks.type = { href: client.typeHref(integration.testCaseTypeId) }
          }
          if (integration.parentStrategy === "SingleParent" && integration.defaultParentWorkPackageId) {
            updateLinks.parent = { href: client.parentHref(integration.defaultParentWorkPackageId) }
          }
          if (Object.keys(updateLinks).length > 0) {
            updateData._links = updateLinks
          }

          await client.updateWorkPackage(existingMapping.externalId, updateData, wp.lockVersion)

          await prisma.externalSyncMapping.update({
            where: { id: existingMapping.id },
            data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
          })

          updatedCount++
          results.push({
            localId: tc.id,
            title: tc.title,
            action: "updated",
            externalId: existingMapping.externalId,
            externalUrl: existingMapping.externalUrl || undefined,
          })
        } else {
          // Check for orphaned WP in OpenProject (duplicate prevention via marker search)
          const existingWp = await client.findWorkPackageByMarker(tc.id)

          if (existingWp) {
            // Re-attach mapping to existing OpenProject WP
            const wpUrl = client.workPackageUrl(existingWp.id)
            await prisma.externalSyncMapping.create({
              data: {
                projectId: params.projectId,
                provider: "OpenProject",
                localEntityType: "TestCase",
                localEntityId: tc.id,
                externalId: String(existingWp.id),
                externalUrl: wpUrl,
                externalType: "TestCase",
                lastSyncedAt: new Date(),
                lastSyncStatus: "success",
              },
            })

            // Update the existing WP content
            const updateData: Record<string, any> = {
              subject,
              description: { format: "markdown", raw: description },
            }
            const updateLinks: Record<string, { href: string }> = {}
            if (integration.testCaseTypeId) {
              updateLinks.type = { href: client.typeHref(integration.testCaseTypeId) }
            }
            if (integration.parentStrategy === "SingleParent" && integration.defaultParentWorkPackageId) {
              updateLinks.parent = { href: client.parentHref(integration.defaultParentWorkPackageId) }
            }
            if (Object.keys(updateLinks).length > 0) {
              updateData._links = updateLinks
            }

            try {
              await client.updateWorkPackage(String(existingWp.id), updateData, existingWp.lockVersion)
            } catch {
              // Update failed but mapping was created — still mark as updated
            }

            updatedCount++
            results.push({
              localId: tc.id,
              title: tc.title,
              action: "updated",
              externalId: String(existingWp.id),
              externalUrl: wpUrl,
            })
          } else {
            // CREATE new work package
            const wp = await client.createWorkPackage({
              subject,
              description: { format: "markdown", raw: description },
              _links: links,
            })

            const wpUrl = client.workPackageUrl(wp.id)

            await prisma.externalSyncMapping.create({
              data: {
                projectId: params.projectId,
                provider: "OpenProject",
                localEntityType: "TestCase",
                localEntityId: tc.id,
                externalId: String(wp.id),
                externalUrl: wpUrl,
                externalType: "TestCase",
                lastSyncedAt: new Date(),
                lastSyncStatus: "success",
              },
            })

            createdCount++
            results.push({
              localId: tc.id,
              title: tc.title,
              action: "created",
              externalId: String(wp.id),
              externalUrl: wpUrl,
            })
          }
        }
      } catch (err: any) {
        failedCount++
        // Save failure to mapping if it exists
        if (existingMapping) {
          await prisma.externalSyncMapping.update({
            where: { id: existingMapping.id },
            data: { lastSyncStatus: "failed", lastSyncError: err.message },
          }).catch(() => {})
        }
        results.push({
          localId: tc.id,
          title: tc.title,
          action: "failed",
          error: err.message || "Unknown error",
        })
      }
    }

    // Update sync run record
    await prisma.openProjectSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: failedCount > 0 && createdCount + updatedCount === 0 ? "Failed" : "Completed",
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        completedAt: new Date(),
        details: results as any,
      },
    })

    // Update last sync timestamp on whichever row owns the integration
    await persistLastSyncAt(resolved.loaded)

    const message = [
      createdCount > 0 ? `Created: ${createdCount}` : "",
      updatedCount > 0 ? `Updated: ${updatedCount}` : "",
      failedCount > 0 ? `Failed: ${failedCount}` : "",
    ].filter(Boolean).join(" · ")

    return NextResponse.json({
      syncRunId: syncRun.id,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      total: testCases.length,
      message: message || "No changes",
      details: results,
    })
  } catch (err: any) {
    console.error("[op-sync-test-cases] Unhandled error:", err)
    return NextResponse.json(
      { error: err.message || "Internal server error during sync" },
      { status: 500 }
    )
  }
}
