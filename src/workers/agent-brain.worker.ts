import { Worker } from "bullmq"
import { redisConnection, registerWorkerHeartbeat, publishAgentBrainEvent, isAgentBrainCancelSignalSet, clearAgentBrainCancelSignal } from "@/lib/queue"
import { prisma } from "@/lib/db"
import { analyzeApplicationContext } from "@/lib/agent-brain/brain"
import { generateExecutionPlan } from "@/lib/agent-brain/planner"
import { runExecutionPlan } from "@/lib/agent-brain/executor"
import { getProjectMemory } from "@/lib/agent-brain/memory"
import { BrainMetrics } from "@/lib/agent-brain/types"

console.log("[AGENT BRAIN WORKER STARTUP] Starting Agent Brain worker process...")

const workerId = process.env.HOSTNAME || `agent-brain-worker-${Math.random().toString(36).substring(2, 11)}`
let currentJobId: string | null = null
let workerStatus: "idle" | "busy" | "error" = "idle"

async function runAgentBrainPipeline(runId: string) {
  console.log(`[AgentBrain] Starting pipeline run: ${runId}`)

  // Initial State: Fetch run settings
  const agentRun = await prisma.agentBrainRun.findUnique({
    where: { id: runId },
    include: { project: true }
  })

  if (!agentRun) {
    throw new Error(`Agent Brain run ${runId} not found`)
  }

  const projectId = agentRun.projectId
  const mode = agentRun.mode
  const startTime = Date.now()

  // Save current project memory snapshot for audit
  const memorySnapshot = await getProjectMemory(projectId)
  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: {
      startedAt: new Date(),
      memorySnapshot: memorySnapshot as any
    }
  })

  // 1. Understanding Layer
  console.log(`[AgentBrain] Transitioning to: Understanding`)
  if (await isAgentBrainCancelSignalSet(runId)) {
    console.log(`[AgentBrain] Cancellation signal detected for run ${runId} before Understanding Layer.`)
    await clearAgentBrainCancelSignal(runId)
    return
  }
  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: { status: "Understanding" }
  })
  await publishAgentBrainEvent(runId, "status_changed", { status: "Understanding" })

  const understandingStart = performance.now()
  const understanding = await analyzeApplicationContext(projectId, agentRun.userInstruction)
  const planningStart = performance.now()

  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: { appUnderstanding: understanding as any }
  })
  await publishAgentBrainEvent(runId, "understanding_completed", { understanding })

  // Mode check: If exploration mode, stop here!
  if (mode === "Exploration") {
    const totalDuration = Date.now() - startTime
    const metrics: BrainMetrics = {
      planningDurationMs: Math.floor(planningStart - understandingStart),
      averageStepDurationMs: 0,
      locatorResolutionMs: 0,
      memoryLookupMs: 0,
      totalDurationMs: totalDuration
    }

    await prisma.agentBrainRun.update({
      where: { id: runId },
      data: {
        status: "Completed",
        completedAt: new Date(),
        metrics: metrics as any,
        summary: "Exploration completed successfully. Coverage map generated with detected paths and DOM components."
      }
    })
    await publishAgentBrainEvent(runId, "completed", { status: "Completed", metrics })
    return
  }

  // 2. Planning Layer
  console.log(`[AgentBrain] Transitioning to: Planning`)
  if (await isAgentBrainCancelSignalSet(runId)) {
    console.log(`[AgentBrain] Cancellation signal detected for run ${runId} before Planning Layer.`)
    await clearAgentBrainCancelSignal(runId)
    return
  }
  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: { status: "Planning" }
  })
  await publishAgentBrainEvent(runId, "status_changed", { status: "Planning" })

  const executionPlan = await generateExecutionPlan(projectId, understanding, mode)
  const executionPlanStart = performance.now()

  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: { executionPlan: executionPlan as any }
  })
  await publishAgentBrainEvent(runId, "planning_completed", { executionPlan })

  // Mode check: If planning mode, stop here!
  if (mode === "Planning") {
    const totalDuration = Date.now() - startTime
    const metrics: BrainMetrics = {
      planningDurationMs: Math.floor(executionPlanStart - understandingStart),
      averageStepDurationMs: 0,
      locatorResolutionMs: 0,
      memoryLookupMs: 0,
      totalDurationMs: totalDuration
    }

    await prisma.agentBrainRun.update({
      where: { id: runId },
      data: {
        status: "Completed",
        completedAt: new Date(),
        metrics: metrics as any,
        summary: `Planning completed successfully. Created execution plan with ${executionPlan.executionPlan.length} test suites.`
      }
    })
    await publishAgentBrainEvent(runId, "completed", { status: "Completed", metrics })
    return
  }

  // 3. Executing Layer (Execution & Autonomous Mode)
  console.log(`[AgentBrain] Transitioning to: Executing`)
  if (await isAgentBrainCancelSignalSet(runId)) {
    console.log(`[AgentBrain] Cancellation signal detected for run ${runId} before Executing Layer.`)
    await clearAgentBrainCancelSignal(runId)
    return
  }
  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: { status: "Executing" }
  })
  await publishAgentBrainEvent(runId, "status_changed", { status: "Executing" })

  const executorMetrics = await runExecutionPlan(executionPlan.executionPlan, {
    agentBrainRunId: runId,
    projectId,
    safetyDoNotDelete: agentRun.safetyDoNotDelete,
    safetyDoNotModify: agentRun.safetyDoNotModify
  })

  // 4. Reporting Layer
  console.log(`[AgentBrain] Transitioning to: Reporting`)
  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: { status: "Reporting" }
  })
  await publishAgentBrainEvent(runId, "status_changed", { status: "Reporting" })

  // Load results to compile summary report
  const finalRuns = await prisma.testRun.findMany({
    where: { agentBrainRunId: runId }
  })

  const passed = finalRuns.filter(r => r.status === "Passed").length
  const failed = finalRuns.filter(r => r.status === "Failed").length
  
  const summaryText = `Agent Brain run completed successfully.
Executed ${finalRuns.length} test scenarios.
Passed: ${passed} | Failed: ${failed}.
Avg step duration: ${executorMetrics.averageStepDurationMs.toFixed(1)}ms.
Avg locator resolution: ${executorMetrics.locatorResolutionMs.toFixed(1)}ms.
Avg memory lookup: ${executorMetrics.memoryLookupMs.toFixed(1)}ms.`

  const totalDuration = Date.now() - startTime
  const finalMetrics: BrainMetrics = {
    planningDurationMs: Math.floor(executionPlanStart - understandingStart),
    averageStepDurationMs: executorMetrics.averageStepDurationMs,
    locatorResolutionMs: executorMetrics.locatorResolutionMs,
    memoryLookupMs: executorMetrics.memoryLookupMs,
    totalDurationMs: totalDuration
  }

  // Save completion state
  await prisma.agentBrainRun.update({
    where: { id: runId },
    data: {
      status: "Completed",
      completedAt: new Date(),
      metrics: finalMetrics as any,
      summary: summaryText
    }
  })

  await publishAgentBrainEvent(runId, "completed", {
    status: "Completed",
    metrics: finalMetrics,
    summary: summaryText
  })
  console.log(`[AgentBrain] Pipeline completed successfully for run: ${runId}`)
}

export function startAgentBrainWorker() {
  console.log("[AgentBrainWorker] starting queue processor...")
  const worker = new Worker(
    "agent-brain-queue",
    async (job) => {
      const { runId } = job.data
      console.log(`[AGENT BRAIN WORKER JOB] Processing runId: ${runId}`)
      currentJobId = runId
      workerStatus = "busy"

      try {
        await runAgentBrainPipeline(runId)
      } catch (err: any) {
        workerStatus = "error"
        const currentRun = await prisma.agentBrainRun.findUnique({
          where: { id: runId }
        })
        if (currentRun?.status === "Cancelled") {
          console.log(`[AgentBrainWorker] Run ${runId} was cancelled. Skipping status: "Failed" update.`)
        } else {
          await prisma.agentBrainRun.update({
            where: { id: runId },
            data: { status: "Failed", completedAt: new Date() }
          })
          await publishAgentBrainEvent(runId, "failed", { error: err.message })
          throw err
        }
      } finally {
        currentJobId = null
        workerStatus = "idle"
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  )

  worker.on("error", (error) => {
    console.error("[Agent Brain Worker] Global error:", error.message)
  })

  const heartbeatInterval = setInterval(async () => {
    try {
      const memoryUsage = process.memoryUsage().rss
      await registerWorkerHeartbeat(workerId, {
        status: workerStatus,
        currentJobId,
        memoryUsage,
        browserStatus: "Active",
      })
    } catch (err: any) {
      console.error("[Agent Brain Worker] Heartbeat registration failed:", err.message)
    }
  }, 5000)

  return {
    worker,
    heartbeatInterval
  }
}
