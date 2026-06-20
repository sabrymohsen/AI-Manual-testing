import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  request: Request,
  { params }: { params: { agentRunId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  let agentRun = await prisma.qAAgentRun.findUnique({
    where: { id: params.agentRunId },
    include: {
      project: { select: { name: true, webAppUrl: true } },
      steps: { orderBy: { stepNumber: "asc" } },
      findings: { orderBy: { createdAt: "desc" } }
    }
  })

  if (!agentRun) {
    return notFoundResponse("QA Agent run session not found")
  }

  // Check for 2-minute Queue Wait Timeout
  if (agentRun.status === "Queued" && Date.now() - new Date(agentRun.createdAt).getTime() > 120000) {
    console.warn(`[QAAgentRunDetailAPI] Run ${params.agentRunId} timed out in queue. Marking as Failed.`)
    await prisma.qAAgentRun.update({
      where: { id: params.agentRunId },
      data: {
        status: "Failed",
        completedAt: new Date(),
        currentPhase: "Failed",
        currentMessage: "Agent run failed: Queue wait timeout after 2 minutes.",
        failedReason: "Queue wait timeout after 2 minutes.",
        failedAt: new Date()
      }
    })

    const existing = await prisma.qAAgentRunStep.findFirst({
      where: { agentRunId: params.agentRunId, name: "WorkerStarted" }
    })
    if (existing) {
      await prisma.qAAgentRunStep.update({
        where: { id: existing.id },
        data: {
          status: "Failed",
          error: "Queue wait timeout after 2 minutes.",
          completedAt: new Date()
        }
      })
    } else {
      await prisma.qAAgentRunStep.create({
        data: {
          agentRunId: params.agentRunId,
          stepNumber: 2,
          name: "WorkerStarted",
          type: "WorkerStarted",
          status: "Failed",
          error: "Queue wait timeout after 2 minutes.",
          completedAt: new Date()
        }
      })
    }

    // Re-fetch updated run details
    agentRun = await prisma.qAAgentRun.findUnique({
      where: { id: params.agentRunId },
      include: {
        project: { select: { name: true, webAppUrl: true } },
        steps: { orderBy: { stepNumber: "asc" } },
        findings: { orderBy: { createdAt: "desc" } }
      }
    })
  }

  return NextResponse.json({ agentRun })
}
