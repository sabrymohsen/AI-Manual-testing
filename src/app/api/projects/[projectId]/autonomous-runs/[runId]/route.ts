import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const agentRun = await prisma.autonomousAgentRun.findFirst({
    where: { id: params.runId, projectId: params.projectId },
    include: {
      testRuns: {
        include: {
          testCase: { select: { title: true } },
          stepResults: { orderBy: { stepNumber: "asc" } }
        },
        orderBy: { createdAt: "asc" }
      },
      bugReports: {
        orderBy: { createdAt: "desc" }
      }
    }
  })

  if (!agentRun) {
    return notFoundResponse("Autonomous agent run not found")
  }

  return NextResponse.json({ agentRun })
}
