/**
 * POST /api/projects/[projectId]/integrations/openproject/check-board-visibility
 *
 * Checks each synced test case for board readiness.
 * Returns per-case status with missing fields.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

interface BoardCheckResult {
  testCaseId: string
  testCaseTitle: string
  externalId: string | null
  status: "Ready" | "Not Ready" | "Not Synced"
  issues: string[]
}

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

    // Load all test cases with their mappings
    const testCases = await prisma.testCase.findMany({
      where: { projectId: params.projectId },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    })

    const mappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "TestCase",
      },
    })
    const mappingMap = new Map(mappings.map((m) => [m.localEntityId, m]))

    const results: BoardCheckResult[] = []
    let readyCount = 0
    let notReadyCount = 0
    let notSyncedCount = 0

    for (const tc of testCases) {
      const mapping = mappingMap.get(tc.id)

      if (!mapping) {
        notSyncedCount++
        results.push({
          testCaseId: tc.id,
          testCaseTitle: tc.title,
          externalId: null,
          status: "Not Synced",
          issues: ["No OpenProject mapping — sync test case first"],
        })
        continue
      }

      const issues: string[] = []

      // Check type mapping
      if (!integration.testCaseTypeId) {
        issues.push("No test case type mapped")
      }

      // Check status mapping based on board strategy
      if (integration.boardStrategy === "StatusBased") {
        const hasAnyStatusMapping =
          integration.defaultStatusId ||
          integration.notExecutedStatusId ||
          integration.passedStatusId ||
          integration.failedStatusId ||
          integration.blockedStatusId
        if (!hasAnyStatusMapping) {
          issues.push("No status mapping configured")
        }
      }

      // Check parent for parent-child board strategy
      if (integration.boardStrategy === "ParentChildBased") {
        if (integration.parentStrategy === "None" || !integration.defaultParentWorkPackageId) {
          issues.push("Missing parent — required for parent-child board")
        } else {
          // Check if the WP actually has a parent set in OpenProject
          try {
            const wp = await client.getWorkPackage(mapping.externalId)
            if (!wp._links?.parent?.href) {
              issues.push("Parent not linked in OpenProject — run Apply Parent")
            }
          } catch (err: any) {
            issues.push(`Cannot fetch WP: ${err.message}`)
          }
        }
      }

      // Check version for version board strategy
      if (integration.boardStrategy === "VersionBased") {
        if (!integration.targetVersionId) {
          issues.push("Missing target version — required for version board")
        }
      }

      if (issues.length === 0) {
        readyCount++
        results.push({
          testCaseId: tc.id,
          testCaseTitle: tc.title,
          externalId: mapping.externalId,
          status: "Ready",
          issues: [],
        })
      } else {
        notReadyCount++
        results.push({
          testCaseId: tc.id,
          testCaseTitle: tc.title,
          externalId: mapping.externalId,
          status: "Not Ready",
          issues,
        })
      }
    }

    // Create sync run log
    await prisma.openProjectSyncRun.create({
      data: {
        projectId: params.projectId,
        operation: "check-board-readiness",
        status: "Completed",
        totalCount: testCases.length,
        createdCount: readyCount,
        skippedCount: notSyncedCount,
        failedCount: notReadyCount,
        completedAt: new Date(),
        startedAt: new Date(),
        details: { summary: { ready: readyCount, notReady: notReadyCount, notSynced: notSyncedCount } } as any,
      },
    })

    return NextResponse.json({
      ready: readyCount,
      notReady: notReadyCount,
      notSynced: notSyncedCount,
      total: testCases.length,
      results,
    })
  } catch (err: any) {
    console.error("[op-check-board] Error:", err)
    return NextResponse.json({ error: err.message || "Board visibility check failed" }, { status: 500 })
  }
}
