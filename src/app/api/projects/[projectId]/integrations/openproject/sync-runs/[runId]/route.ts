/**
 * GET /api/projects/[projectId]/integrations/openproject/sync-runs/[runId]
 *
 * Detailed sync run with per-item results.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const run = await prisma.openProjectSyncRun.findUnique({
    where: { id: params.runId },
  })

  if (!run || run.projectId !== params.projectId) {
    return NextResponse.json({ error: "Sync run not found" }, { status: 404 })
  }

  return NextResponse.json({ run })
}
