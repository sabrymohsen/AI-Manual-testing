import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { cancelAgentBrainJob, agentBrainQueue } from "@/lib/queue"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const run = await prisma.agentBrainRun.findUnique({
    where: { id: params.runId }
  })

  if (!run) {
    return notFoundResponse("Agent Brain run session not found")
  }

  // Case 1: Run is Queued
  if (run.status === "Queued") {
    try {
      const job = await agentBrainQueue.getJob(params.runId)
      if (job) {
        await job.remove()
      }
    } catch (err: any) {
      console.warn(`[AgentBrainCancelAPI] Could not remove BullMQ job: ${err.message}`)
    }

    const updatedRun = await prisma.agentBrainRun.update({
      where: { id: params.runId },
      data: {
        status: "Cancelled",
        completedAt: new Date(),
        summary: "Run cancelled before worker started."
      }
    })

    return NextResponse.json({
      success: true,
      status: "Cancelled",
      message: "Queued agent brain run cancelled successfully.",
      agentRun: updatedRun
    })
  }

  // Case 2: Run is active/running
  const updatedRun = await prisma.agentBrainRun.update({
    where: { id: params.runId },
    data: {
      status: "Cancelled",
      completedAt: new Date(),
      summary: "Cancellation requested by user. Aborting..."
    }
  })

  // Set the cancellation signal in Redis
  try {
    await cancelAgentBrainJob(params.runId)
  } catch (err: any) {
    console.warn(`[AgentBrainCancelAPI] Could not cancel Agent Brain job: ${err.message}`)
  }

  return NextResponse.json({
    success: true,
    status: "Cancelled",
    message: "Cancellation request sent to worker.",
    agentRun: updatedRun
  })
}
