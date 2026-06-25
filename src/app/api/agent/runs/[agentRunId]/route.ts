import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { qaAgentQueue, getActiveWorkers } from "@/lib/queue"

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
      findings: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "asc" } }
    }
  })

  if (!agentRun) {
    return notFoundResponse("QA Agent run session not found")
  }

  // Check for 2-minute Queue Wait Timeout
  if (agentRun.status === "Queued" && Date.now() - new Date(agentRun.createdAt).getTime() > 120000) {
    console.warn(`[QAAgentRunDetailAPI] Run ${params.agentRunId} timed out in queue. Marking as Failed.`)
    agentRun = await prisma.qAAgentRun.update({
      where: { id: params.agentRunId },
      data: {
        status: "Failed",
        completedAt: new Date(),
        currentPhase: "Failed",
        currentMessage: "Worker did not pick up the job. Please start npm run worker.",
        failedReason: "Agent worker did not pick up this run within 2 minutes.",
        failedAt: new Date()
      },
      include: {
        project: { select: { name: true, webAppUrl: true } },
        steps: { orderBy: { stepNumber: "asc" } },
        findings: { orderBy: { createdAt: "desc" } },
        events: { orderBy: { createdAt: "asc" } }
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
          error: "Agent worker did not pick up this run within 2 minutes.",
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
          error: "Agent worker did not pick up this run within 2 minutes.",
          completedAt: new Date()
        }
      })
    }

    // Add finding
    await prisma.qAAgentFinding.create({
      data: {
        agentRunId: params.agentRunId,
        type: "Risk",
        severity: "High",
        title: "Worker Pickup Timeout",
        description: "Agent worker did not pick up this run within 2 minutes."
      }
    })
  }

  // Resolve Queue Diagnostics and Job counts
  let jobState = "unknown"
  let workerOnline = false
  let waitingJobs = 0
  let activeJobs = 0
  let failedJobs = 0

  try {
    const workers = await getActiveWorkers()
    workerOnline = workers.length > 0

    if (agentRun.jobId) {
      const job = await qaAgentQueue.getJob(agentRun.jobId)
      if (job) {
        jobState = await job.getState()
      } else {
        jobState = "not_found"
      }
    }

    waitingJobs = await qaAgentQueue.getWaitingCount()
    activeJobs = await qaAgentQueue.getActiveCount()
    failedJobs = await qaAgentQueue.getFailedCount()
  } catch (err) {
    console.error("[QAAgentRunDetailAPI] Error checking queue diagnostics:", err)
  }

  const queueDiagnostics = {
    queueName: "agent-run-queue",
    jobId: agentRun.jobId || null,
    jobState,
    waitingJobs,
    activeJobs,
    failedJobs,
    workerOnline
  }

  // Calculate progress mapping
  const progressByStatus: Record<string, number> = {
    Queued: 5,
    Scanning: 20,
    Planning: 40,
    WaitingForApproval: 50,
    Running: 70,
    Reporting: 90,
    Completed: 100,
    Failed: 100,
    Cancelled: 100,
  }
  const progress = progressByStatus[agentRun.status] || 5

  // Calculate elapsedMs
  const startTime = agentRun.startedAt ? new Date(agentRun.startedAt).getTime() : new Date(agentRun.createdAt).getTime()
  const endTime = agentRun.completedAt ? new Date(agentRun.completedAt).getTime() : Date.now()
  const elapsedMs = Math.max(0, endTime - startTime)

  // Calculate phaseElapsedMs
  const phaseStartTime = agentRun.currentPhaseStartedAt ? new Date(agentRun.currentPhaseStartedAt).getTime() : new Date(agentRun.createdAt).getTime()
  const phaseEndTime = ["Completed", "Failed", "Cancelled"].includes(agentRun.status) && agentRun.completedAt
    ? new Date(agentRun.completedAt).getTime()
    : Date.now()
  const phaseElapsedMs = Math.max(0, phaseEndTime - phaseStartTime)

  // Calculate workerHealth
  let workerHealthStatus = "No heartbeat yet"
  let secondsSinceHeartbeat: number | null = null
  if (agentRun.lastHeartbeatAt) {
    secondsSinceHeartbeat = Math.floor((Date.now() - new Date(agentRun.lastHeartbeatAt).getTime()) / 1000)
    if (secondsSinceHeartbeat <= 15) {
      workerHealthStatus = "Healthy"
    } else if (secondsSinceHeartbeat <= 60) {
      workerHealthStatus = "Warning"
    } else {
      workerHealthStatus = "Stuck / Offline"
    }
  } else {
    if (agentRun.status !== "Queued") {
      workerHealthStatus = "No heartbeat yet"
    } else {
      workerHealthStatus = "Waiting for worker"
    }
  }

  const workerHealth = {
    status: workerHealthStatus,
    secondsSinceHeartbeat
  }

  let credentialRole: string | null = null
  if (agentRun.credentialId) {
    try {
      const cred = await prisma.projectCredential.findUnique({
        where: { id: agentRun.credentialId },
        select: { roleName: true }
      })
      if (cred) {
        credentialRole = cred.roleName
      }
    } catch (err) {
      console.error("[QAAgentRunDetailAPI] Error fetching credential role:", err)
    }
  }

  const extendedAgentRun = {
    ...(agentRun as any),
    progress,
    currentPhase: agentRun.currentPhase || agentRun.status,
    currentMessage: agentRun.currentMessage || "Awaiting processing...",
    elapsedMs,
    phaseElapsedMs,
    workerHealth,
    queueDiagnostics,
    credentialRole
  }

  const responseData = {
    ...extendedAgentRun,
    agentRun: extendedAgentRun
  }

  return NextResponse.json(responseData)
}
