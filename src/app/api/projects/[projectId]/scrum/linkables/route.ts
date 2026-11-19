import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

/**
 * Lists the project's TestCases and BugReports so the Scrum task drawer can
 * offer them for linking. Read-only picker source.
 */
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const [testCases, bugs] = await Promise.all([
    prisma.testCase.findMany({
      where: { projectId: params.projectId },
      select: { id: true, title: true, priority: true, executionType: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.bugReport.findMany({
      where: { projectId: params.projectId },
      select: { id: true, bugKey: true, title: true, severity: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ])

  return NextResponse.json({ testCases, bugs })
}
