/**
 * GET /api/projects/[projectId]/integrations/openproject/sync-runs
 *
 * Lists recent OpenProjectSyncRun entries for the project.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const runs = await prisma.openProjectSyncRun.findMany({
    where: { projectId: params.projectId },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return NextResponse.json({ runs })
}
