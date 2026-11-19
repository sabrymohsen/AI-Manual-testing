import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { cancelQAAgentJob, qaAgentQueue } from "@/lib/queue"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const run = await prisma.qAAgentRun.findUnique({
    where: { id: params.runId }
  })

  if (!run) {
    return notFoundResponse("Autonomous run session not found")
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
        console.warn(`[AutonomousCancelAPI] Could not remove BullMQ job: ${err.message}`)
      }
    }

    const updatedRun = await prisma.qAAgentRun.update({
      where: { id: params.runId },
      data: {
        status: "Cancelled",
        completedAt: new Date(),
        currentPhase: "Cancelled",
        currentMessage: "Run cancelled before worker started.",
        currentPhaseStartedAt: new Date()
      }
    })

    await prisma.qAAgentRunEvent.create({
      data: {
        agentRunId: params.runId,
        level: "info",
        phase: "Cancelled",
        message: "Run cancelled before worker started."
      }
    })

    return NextResponse.json({
      success: true,
      status: "Cancelled",
      message: "Queued autonomous run cancelled successfully.",
      agentRun: updatedRun
    })
  }

  // Case 2: Run is active/running
  const updatedRun = await prisma.qAAgentRun.update({
    where: { id: params.runId },
    data: {
      cancelRequested: true,
      cancelRequestedAt: new Date(),
      currentMessage: "Cancellation requested by user. Aborting...",
      currentPhaseStartedAt: new Date()
    }
  })

  // Set the cancellation signal in Redis
  try {
    await cancelQAAgentJob(params.runId)
  } catch (err: any) {
    console.warn(`[AutonomousCancelAPI] Could not cancel QA Agent job: ${err.message}`)
  }

  await prisma.qAAgentRunEvent.create({
    data: {
      agentRunId: params.runId,
      level: "info",
      phase: "Cancelled",
      message: "Cancellation requested by user."
    }
  })

  return NextResponse.json({
    success: true,
    status: "Cancelled",
    message: "Cancellation request sent to worker.",
    agentRun: updatedRun
  })
}
