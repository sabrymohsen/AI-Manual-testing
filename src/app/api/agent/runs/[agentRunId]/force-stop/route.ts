import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { qaAgentQueue } from "@/lib/queue"

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

  // Remove job from BullMQ if it exists
  if (run.jobId) {
    try {
      const job = await qaAgentQueue.getJob(run.jobId)
      if (job) {
        await job.remove()
      }
    } catch (err: any) {
      console.warn(`[QAAgentForceStopAPI] Could not remove BullMQ job: ${err.message}`)
    }
  }

  const updatedRun = await prisma.qAAgentRun.update({
    where: { id: params.agentRunId },
    data: {
      status: "Failed",
      completedAt: new Date(),
      currentPhase: "Failed",
      currentMessage: "Run was force stopped by user.",
      failedReason: "Run was force stopped by user.",
      failedAt: new Date(),
      currentPhaseStartedAt: new Date()
    }
  })

  // Create event log
  await prisma.qAAgentRunEvent.create({
    data: {
      agentRunId: params.agentRunId,
      level: "warning",
      phase: "Failed",
      message: "Run was force stopped by user."
    }
  })

  return NextResponse.json({
    success: true,
    status: "Failed",
    message: "Run was force stopped by user.",
    agentRun: updatedRun
  })
}
