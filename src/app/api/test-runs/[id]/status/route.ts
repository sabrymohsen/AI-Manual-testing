import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, memberProjectWhere } from "@/lib/api-guards"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const testRun = await prisma.testRun.findFirst({
      where: {
        id: params.id,
        project: memberProjectWhere(session.user.id),
      },
      include: {
        stepResults: true,
      },
    })

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 })
    }

    const totalSteps = testRun.stepResults.length
    const completedSteps = testRun.stepResults.filter(
      (s) => s.status === "Passed" || s.status === "Failed" || s.status === "Blocked" || s.status === "Warning"
    ).length

    return NextResponse.json({
      id: testRun.id,
      status: testRun.status,
      startedAt: testRun.startedAt,
      completedAt: testRun.completedAt,
      durationMs: testRun.durationMs,
      progress: {
        totalSteps,
        completedSteps,
        percentage: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch status" }, { status: 500 })
  }
}
