import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { addQAAgentJob } from "@/lib/queue"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { QAAgentMode, QAAgentSafetyLevel } from "@prisma/client"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const runs = await prisma.qAAgentRun.findMany({
    where: { projectId: params.projectId, mode: QAAgentMode.Autonomous },
    orderBy: { createdAt: "desc" },
  })

  // Map to legacy AutonomousAgentRun structure for backwards compatibility
  const legacyRuns = runs.map(run => {
    let runMode = "Balanced"
    if (run.scope && typeof run.scope === 'object' && (run.scope as any).mode) {
      runMode = (run.scope as any).mode
    }
    return {
      id: run.id,
      projectId: run.projectId,
      status: run.status,
      mode: runMode,
      safetyDoNotDelete: true,
      safetyDoNotModify: run.safetyLevel === "ReadOnly",
      summary: run.summary ? JSON.stringify(run.summary) : null,
      metrics: null,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt
    }
  })

  return NextResponse.json({ runs: legacyRuns })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is fine
  }

  const mode = body.mode || "Balanced"
  if (!["Fast", "Balanced", "Full"].includes(mode)) {
    return badRequestResponse("Invalid execution mode. Expected Fast, Balanced, or Full.")
  }

  const safetyDoNotDelete = body.safetyDoNotDelete !== false
  const safetyDoNotModify = body.safetyDoNotModify === true

  const safetyLevel = safetyDoNotModify
    ? QAAgentSafetyLevel.ReadOnly
    : QAAgentSafetyLevel.AllowFormFill

  const run = await prisma.qAAgentRun.create({
    data: {
      projectId: params.projectId,
      mode: QAAgentMode.Autonomous,
      goal: "Run autonomous QA agent",
      scope: { type: "project", mode },
      safetyLevel,
      status: "Queued",
      currentPhase: "Queued",
      currentMessage: "Agent run created and queued. Waiting for worker...",
      currentPhaseStartedAt: new Date()
    }
  })

  // Log events
  await prisma.qAAgentRunEvent.createMany({
    data: [
      { agentRunId: run.id, level: "info", phase: "Queued", message: "Run created" },
      { agentRunId: run.id, level: "info", phase: "Queued", message: "Job queued" },
      { agentRunId: run.id, level: "info", phase: "Queued", message: "Waiting for worker" }
    ]
  })

  // Create initial step
  await prisma.qAAgentRunStep.create({
    data: {
      agentRunId: run.id,
      stepNumber: 1,
      name: "Queued",
      type: "Queued",
      status: "Completed",
      startedAt: new Date(),
      completedAt: new Date(),
      details: { message: "Agent run created and queued. Waiting for worker..." }
    }
  })

  // Enqueue job in BullMQ using the unified queue helper
  const jobId = await addQAAgentJob(run.id)

  await prisma.qAAgentRun.update({
    where: { id: run.id },
    data: { jobId }
  })

  return NextResponse.json({
    agentRun: {
      id: run.id,
      projectId: run.projectId,
      status: run.status,
      mode,
      safetyDoNotDelete,
      safetyDoNotModify,
      createdAt: run.createdAt
    }
  }, { status: 201 })
}
