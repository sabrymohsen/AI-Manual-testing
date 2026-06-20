import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { cancelQAAgentJob } from "@/lib/queue"

export async function POST(
  request: Request,
  { params }: { params: { agentRunId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const run = await prisma.qAAgentRun.findUnique({
    where: { id: params.agentRunId }
  })

  if (!run) {
    return notFoundResponse("QA Agent run session not found")
  }

  // Update status in DB
  const updatedRun = await prisma.qAAgentRun.update({
    where: { id: params.agentRunId },
    data: {
      status: "Cancelled",
      completedAt: new Date(),
      currentPhase: "Cancelled",
      currentMessage: "Agent run was cancelled by the user."
    }
  })

  // Try to remove job from BullMQ and publish cancellation signal to Redis
  try {
    await cancelQAAgentJob(params.agentRunId)
  } catch (err: any) {
    console.warn(`[QAAgentCancelAPI] Could not cancel QA Agent job: ${err.message}`)
  }

  return NextResponse.json({ agentRun: updatedRun })
}
