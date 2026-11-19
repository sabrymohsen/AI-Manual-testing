import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"

/**
 * GET /api/projects/[projectId]/integrations/sync-status
 * Returns a map of testCaseId → { externalId, externalUrl, lastSyncedAt, lastSyncStatus }
 * for all test cases in this project that have been synced to OpenProject.
 */
export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const mappings = await prisma.externalSyncMapping.findMany({
    where: {
      projectId: params.projectId,
      provider: "OpenProject",
      localEntityType: "TestCase",
    },
    select: {
      localEntityId: true,
      externalId: true,
      externalUrl: true,
      lastSyncedAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
    },
  })

  const map: Record<string, {
    externalId: string
    externalUrl: string | null
    lastSyncedAt: string | null
    lastSyncStatus: string | null
    lastSyncError: string | null
  }> = {}

  for (const m of mappings) {
    map[m.localEntityId] = {
      externalId: m.externalId,
      externalUrl: m.externalUrl,
      lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
      lastSyncStatus: m.lastSyncStatus,
      lastSyncError: m.lastSyncError,
    }
  }

  return NextResponse.json({ syncMap: map })
}
