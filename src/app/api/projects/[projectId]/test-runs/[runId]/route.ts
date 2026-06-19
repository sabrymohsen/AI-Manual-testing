import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { cancelTestRunJob, getJobStatus } from "@/lib/queue"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
    return notFoundResponse("Test run not found")
  }

  return NextResponse.json({ testRun })
}

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
