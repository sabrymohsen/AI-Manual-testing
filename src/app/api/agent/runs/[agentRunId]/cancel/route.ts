import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { cancelQAAgentJob, qaAgentQueue } from "@/lib/queue"

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

  // Case 1: Run is Queued
  if (run.status === "Queued") {
    if (run.jobId) {
      try {
        const job = await qaAgentQueue.getJob(run.jobId)
        if (job) {
          await job.remove()
        }
      } catch (err: any) {
        console.warn(`[QAAgentCancelAPI] Could not remove BullMQ job: ${err.message}`)
      }
    }

    const updatedRun = await prisma.qAAgentRun.update({
      where: { id: params.agentRunId },
      data: {
        status: "Cancelled",
        completedAt: new Date(),
        currentPhase: "Cancelled",
        currentMessage: "Run cancelled before worker started.",
        currentPhaseStartedAt: new Date()
      }
    })

    // Log the cancellation event
    await prisma.qAAgentRunEvent.create({
      data: {
        agentRunId: params.agentRunId,
        level: "info",
        phase: "Cancelled",
        message: "Run cancelled before worker started."
      }
    })

    return NextResponse.json({
      success: true,
      status: "Cancelled",
      message: "Queued agent run cancelled successfully.",
      agentRun: updatedRun
    })
  }

  // Case 2: Run is active/running
  const updatedRun = await prisma.qAAgentRun.update({
    where: { id: params.agentRunId },
    data: {
      cancelRequested: true,
      cancelRequestedAt: new Date(),
      currentMessage: "Cancellation requested by user. Aborting...",
      currentPhaseStartedAt: new Date()
    }
  })

  // Set the cancellation signal in Redis (Pub/Sub & setCancelSignal)
  try {
    await cancelQAAgentJob(params.agentRunId)
  } catch (err: any) {
    console.warn(`[QAAgentCancelAPI] Could not cancel QA Agent job: ${err.message}`)
  }

  // Log event
  await prisma.qAAgentRunEvent.create({
    data: {
      agentRunId: params.agentRunId,
      level: "info",
      phase: "Cancelled",
      message: "Cancellation requested by user."
    }
  })

  return NextResponse.json({
    success: true,
    status: run.status,
    message: "Cancellation request sent to worker.",
    agentRun: updatedRun
  })
}
