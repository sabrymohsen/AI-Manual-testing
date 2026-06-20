import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { addQAAgentJob } from "@/lib/queue"
import { QAAgentMode, QAAgentSafetyLevel, BrowserType, ViewportType } from "@prisma/client"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
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
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { mode, goal, scope, safetyLevel, credentialId, browserType, viewport } = body

    if (!mode || !goal) {
      return NextResponse.json({ error: "Missing required fields: mode, goal" }, { status: 400 })
    }

    const run = await prisma.qAAgentRun.create({
      data: {
        projectId: params.projectId,
        mode: mode as QAAgentMode,
        goal,
        scope: scope || {},
        safetyLevel: (safetyLevel as QAAgentSafetyLevel) || QAAgentSafetyLevel.ReadOnly,
        credentialId: credentialId || null,
        browserType: (browserType as BrowserType) || BrowserType.Chromium,
        viewport: viewport || "1280x800",
        status: "Queued",
        currentPhase: "Queued",
        currentMessage: "Agent run created and queued. Waiting for worker..."
      }
    })

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
    await addQAAgentJob(run.id)

    return NextResponse.json({ agentRun: run }, { status: 201 })
  } catch (err: any) {
    console.error("[QAAgentRunsAPI] Failed to trigger run:", err)
    return NextResponse.json({ error: err.message || "Failed to trigger run" }, { status: 500 })
  }
}
