import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { errorResponse, guardProject } from "@/lib/visual-tests/access"

/** The visual checkpoints a functional test run produced, for its results page. */
export async function GET(_req: Request, { params }: { params: { testRunId: string } }) {
  const testRun = await prisma.testRun.findUnique({ where: { id: params.testRunId }, select: { projectId: true } })
  if (!testRun) return NextResponse.json({ error: "Test run not found" }, { status: 404 })
  const g = await guardProject(testRun.projectId)
  if (!g.ok) return g.response
  try {
    const run = await prisma.visualTestRun.findFirst({
      where: { testRunId: params.testRunId },
      select: { id: true, status: true, outcome: true, totalScreens: true, passedCount: true, unresolvedCount: true, failedCount: true, newCount: true, visualTestId: true },
    })
    return NextResponse.json({ run })
  } catch (err) {
    return errorResponse(err, "Could not load visual checkpoints")
  }
}
