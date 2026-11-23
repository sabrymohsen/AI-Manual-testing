import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

/**
 * GET /api/hub/browser-agent/cases?projectId=&search=
 * The project's test cases with their steps, for the Browser Agent to run.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")
  const auth = await requireHubProject(projectId, "read")
  if (!auth.ok) return auth.response
  const search = (request.nextUrl.searchParams.get("search") || "").trim().slice(0, 200)
  const cases = await prisma.testCase.findMany({
    where: { projectId: projectId!, ...(search ? { title: { contains: search, mode: "insensitive" } } : {}) },
    select: {
      id: true,
      title: true,
      steps: { select: { stepNumber: true, actionDescription: true, expectedResult: true }, orderBy: { stepNumber: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  })
  return NextResponse.json({
    cases: cases
      .filter((c) => c.steps.length)
      .map((c) => ({ id: c.id, title: c.title, steps: c.steps.map((s) => ({ action: s.actionDescription, expected: s.expectedResult })) })),
  })
}
