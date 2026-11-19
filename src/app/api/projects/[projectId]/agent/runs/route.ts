import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { addQAAgentJob } from "@/lib/queue"
import { QAAgentMode, QAAgentSafetyLevel, BrowserType, ViewportType } from "@prisma/client"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const runs = await prisma.qAAgentRun.findMany({
    where: { projectId: params.projectId },
    orderBy: { createdAt: "desc" }
  })

  return NextResponse.json({ runs })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { mode, goal, scope, safetyLevel, credentialId, browserType, viewport, targetUrl, environment } = body

    if (!mode || !goal) {
      return NextResponse.json({ error: "Missing required fields: mode, goal" }, { status: 400 })
    }

    if (targetUrl) {
      await prisma.project.update({
        where: { id: params.projectId },
        data: { webAppUrl: targetUrl }
      })
    }

    const run = await prisma.qAAgentRun.create({
      data: {
        projectId: params.projectId,
        mode: mode as QAAgentMode,
        goal,
        scope: {
          ...(scope || {}),
          targetUrl,
          environment
        },
        safetyLevel: (safetyLevel as QAAgentSafetyLevel) || QAAgentSafetyLevel.ReadOnly,
        credentialId: credentialId || null,
        browserType: (browserType as BrowserType) || BrowserType.Chromium,
        viewport: viewport || "1280x800",
        status: "Queued",
        currentPhase: "Queued",
        currentMessage: "Agent run created and queued. Waiting for worker...",
        currentPhaseStartedAt: new Date()
      }
    })

    console.log(`[AgentRun] Created run ${run.id}`)

    // Create the Queued step in the database
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

    // Enqueue background job
    const jobId = await addQAAgentJob(run.id)
    console.log(`[AgentRunQueue] job added: ${jobId}, agentRunId=${run.id}`)

    // Update QAAgentRun record with the jobId
    await prisma.qAAgentRun.update({
      where: { id: run.id },
      data: { jobId }
    })

    // Log the initial events: Run created, Job queued, Waiting for worker
    await prisma.qAAgentRunEvent.createMany({
      data: [
        { agentRunId: run.id, level: "info", phase: "Queued", message: "Run created" },
        { agentRunId: run.id, level: "info", phase: "Queued", message: "Job queued" },
        { agentRunId: run.id, level: "info", phase: "Queued", message: "Waiting for worker" }
      ]
    })

    return NextResponse.json({
      success: true,
      agentRunId: run.id,
      jobId,
      status: "Queued",
      message: "QA Agent run created and queued."
    }, { status: 201 })
  } catch (err: any) {
    console.error("[QAAgentRunsAPI] Failed to trigger run:", err)
    return NextResponse.json({ error: err.message || "Failed to trigger run" }, { status: 500 })
  }
}
