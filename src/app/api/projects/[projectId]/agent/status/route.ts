import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { QAAgentRunStatus } from "@prisma/client"
import { getActiveWorkers, qaAgentQueue, redisClient } from "@/lib/queue"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const project = await prisma.project.findUnique({
    where: { id: params.projectId }
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const runs = await prisma.qAAgentRun.findMany({
    where: { projectId: params.projectId }
  })

  const runningStatuses: QAAgentRunStatus[] = [
    QAAgentRunStatus.Queued,
    QAAgentRunStatus.Scanning,
    QAAgentRunStatus.Planning,
    QAAgentRunStatus.WaitingForApproval,
    QAAgentRunStatus.Running,
    QAAgentRunStatus.Reporting
  ]

  const isAgentRunning = runs.some(r => runningStatuses.includes(r.status))
  const completedRuns = runs.filter(r => r.status === QAAgentRunStatus.Completed)
  
  // Calculate success rate based on summary success flag if available
  const successfulRuns = completedRuns.filter(r => {
    try {
      const summary = r.summary as any
      return summary?.success === true
    } catch {
      return false
    }
  })

  const successRate = completedRuns.length > 0
    ? Math.round((successfulRuns.length / completedRuns.length) * 100)
    : 100

  // Count active findings
  const findingsCount = await prisma.qAAgentFinding.count({
    where: {
      agentRun: { projectId: params.projectId }
    }
  })

  // Retrieve Queue and Heartbeat Diagnostics
  let workerOnline = false
  let lastHeartbeatAt: string | null = null
  let waitingJobs = 0
  let activeJobs = 0
  let failedJobs = 0
  let completedJobs = 0
  let redisConnected = false

  try {
    // Check redis connection
    await redisClient.ping()
    redisConnected = true

    const workers = await getActiveWorkers()
    workerOnline = workers.length > 0
    if (workers.length > 0) {
      const times = workers.map(w => new Date(w.lastHeartbeat).getTime())
      lastHeartbeatAt = new Date(Math.max(...times)).toISOString()
    }
    const counts = await qaAgentQueue.getJobCounts()
    waitingJobs = (counts.waiting || 0) + (counts.delayed || 0)
    activeJobs = counts.active || 0
    failedJobs = counts.failed || 0
    completedJobs = counts.completed || 0
  } catch (err) {
    console.error("[QAAgentStatusAPI] Redis/Queue diagnostics error:", err)
  }

  // Diagnostics check: Playwright Installed Status
  let playwrightInstalled = false
  try {
    require.resolve("playwright")
    playwrightInstalled = true
  } catch {}

  // Diagnostics check: Target URL Validity
  let targetUrlValid = false
  try {
    new URL(project.webAppUrl)
    targetUrlValid = true
  } catch {}

  // Diagnostics check: AI Provider Status
  const hasAiKey = !!(
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  )
  const aiProviderStatus = hasAiKey ? "AI Mode Configured" : "Free Rule-Based Mode"

  return NextResponse.json({
    status: {
      isAgentRunning,
      totalRunsCount: runs.length,
      successRate,
      findingsCount
    },
    workerOnline,
    queueName: "agent-run-queue",
    waitingJobs,
    activeJobs,
    failedJobs,
    completedJobs,
    lastHeartbeatAt,
    redisConnected,
    playwrightInstalled,
    targetUrlValid,
    aiProviderStatus
  })
}
