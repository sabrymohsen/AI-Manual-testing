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
      preconditions: true,
      steps: { select: { stepNumber: true, actionDescription: true, expectedResult: true }, orderBy: { stepNumber: "asc" } },
      // The BRDs it was written from: their test users log in for the run.
      brdRequirementLinks: { select: { requirement: { select: { brdId: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  })
  const withSteps = cases.filter((c) => c.steps.length)
  const brdIds = Array.from(new Set(withSteps.flatMap((c) => c.brdRequirementLinks.map((l) => l.requirement.brdId))))
  const brds = brdIds.length
    ? await prisma.brdDocument.findMany({
        where: { id: { in: brdIds }, projectId: projectId!, isDeleted: false },
        select: { id: true, name: true, testUsers: { select: { key: true, role: true, loginUrl: true, passwordEncrypted: true }, orderBy: { createdAt: "asc" } } },
      })
    : []
  return NextResponse.json({
    cases: withSteps.map((c) => ({
      id: c.id,
      title: c.title,
      preconditions: c.preconditions,
      brdIds: Array.from(new Set(c.brdRequirementLinks.map((l) => l.requirement.brdId))).filter((id) => brds.some((b) => b.id === id)),
      steps: c.steps.map((s) => ({ action: s.actionDescription, expected: s.expectedResult })),
    })),
    // Each BRD's users without logins: the run asks for those separately.
    brds: brds.map((b) => ({ id: b.id, name: b.name, users: b.testUsers.map((u) => ({ key: u.key, role: u.role, loginUrl: u.loginUrl, hasPassword: !!u.passwordEncrypted })) })),
  })
}
