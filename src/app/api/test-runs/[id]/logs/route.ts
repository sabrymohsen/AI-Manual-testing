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
        stepResults: {
          orderBy: { stepNumber: "asc" },
        },
        logs: {
          orderBy: { timestamp: "asc" },
        },
        networkLogs: {
          orderBy: { timestamp: "asc" },
        },
      },
    })

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: testRun.id,
      status: testRun.status,
      startedAt: testRun.startedAt,
      completedAt: testRun.completedAt,
      durationMs: testRun.durationMs,
      stepResults: testRun.stepResults,
      logs: testRun.logs,
      networkLogs: testRun.networkLogs,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch logs" }, { status: 500 })
  }
}
