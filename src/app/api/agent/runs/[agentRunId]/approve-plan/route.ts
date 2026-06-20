import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { addQAAgentJob } from "@/lib/queue"
import { runQAAgentExecutionPipeline } from "@/lib/agent/brain"

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

  if (run.status !== "WaitingForApproval" && run.status !== "Planning") {
    return NextResponse.json({ error: "Run is not in a states awaiting plan approval" }, { status: 400 })
  }

  // Update status to Queued/Running
  const updatedRun = await prisma.qAAgentRun.update({
    where: { id: params.agentRunId },
    data: { status: "Queued" }
  })

  // Enqueue job for background execution phase
  await addQAAgentJob(run.id)

  return NextResponse.json({ agentRun: updatedRun })
}
