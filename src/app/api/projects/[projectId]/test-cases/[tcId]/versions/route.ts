import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

/**
 * GET /api/projects/:projectId/test-cases/:tcId/versions
 *
 * Earlier versions of a case, newest first. Each row is the case as it was
 * BEFORE the edit described by `summary`, made by `changedByName`.
 */
export async function GET(_request: Request, { params }: { params: { projectId: string; tcId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const tc = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
    select: { id: true },
  })
  if (!tc) return notFoundResponse("Test case not found")

  const versions = await prisma.testCaseVersion.findMany({
    where: { testCaseId: params.tcId },
    orderBy: { version: "desc" },
    take: 100,
  })
  return NextResponse.json({ versions })
}
