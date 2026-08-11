/**
 * GET /api/projects/[projectId]/integrations/openproject/status
 *
 * Returns connection status, last sync time, sync counts, and recent sync runs.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { loadIntegration } from "@/lib/integrations/core/load-integration"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  // Reads whichever row owns the config (unified ProjectIntegration first,
  // legacy OpenProjectIntegration second) — a project connected through the
  // unified UI used to report itself as unconfigured here.
  const integration = await loadIntegration(params.projectId)

  if (!integration || integration.provider !== "OpenProject") {
    return NextResponse.json({ configured: false })
  }

  // Count sync mappings
  const [totalSynced, syncedTestCases, syncedBugs, failedMappings] = await Promise.all([
    prisma.externalSyncMapping.count({
      where: { projectId: params.projectId, provider: "OpenProject" },
    }),
    prisma.externalSyncMapping.count({
      where: { projectId: params.projectId, provider: "OpenProject", localEntityType: "TestCase" },
    }),
    prisma.externalSyncMapping.count({
      where: { projectId: params.projectId, provider: "OpenProject", localEntityType: "BugReport" },
    }),
    prisma.externalSyncMapping.count({
      where: { projectId: params.projectId, provider: "OpenProject", lastSyncStatus: "failed" },
    }),
  ])

  // Recent sync runs
  const recentRuns = await prisma.openProjectSyncRun.findMany({
    where: { projectId: params.projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      operation: true,
      status: true,
      totalCount: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      failedCount: true,
      error: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    configured: true,
    connectionStatus: integration.lastConnectionStatus || "unknown",
    lastConnectionCheckedAt: integration.lastConnectionCheckedAt?.toISOString() ?? null,
    lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
    counts: {
      totalSynced,
      syncedTestCases,
      syncedBugs,
      failedMappings,
    },
    recentRuns,
  })
}
