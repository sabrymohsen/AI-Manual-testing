import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { cancelTestRunJob, getJobStatus } from "@/lib/queue"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const testRun = await prisma.testRun.findFirst({
    where: { id: params.runId, projectId: params.projectId },
    include: {
      testCase: {
        include: {
          moduleRelation: true,
          feature: true,
          component: true
        }
      },
      stepResults: {
        orderBy: { stepNumber: "asc" },
        include: {
          logs: { orderBy: { timestamp: "asc" } },
          networkLogs: { orderBy: { timestamp: "asc" } },
        },
      },
      credential: {
        select: { id: true, roleName: true },
      },
      logs: { orderBy: { timestamp: "asc" } },
      networkLogs: { orderBy: { timestamp: "asc" } },
      jobs: true,
    },
  })

  if (!testRun) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 })
  }

  return NextResponse.json({ testRun })
}

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  await cancelTestRunJob(params.runId)

  const testRun = await prisma.testRun.update({
    where: { id: params.runId },
    data: { status: "Cancelled", completedAt: new Date() },
  })

  await prisma.testJob.update({
    where: { testRunId: params.runId },
    data: { status: "Cancelled", completedAt: new Date() },
  })

  return NextResponse.json({ testRun })
}
