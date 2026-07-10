import { Worker } from "bullmq"
import { redisConnection, registerWorkerHeartbeat, AGENT_RUN_QUEUE_NAME } from "@/lib/queue"
import { runTestCase } from "@/lib/playwright/runner"
import { prisma } from "@/lib/db"
import { runQAAgentPipeline } from "@/lib/agent/brain"
import { startAgentBrainWorker } from "./agent-brain.worker"

console.log("[WORKER STARTUP] Initializing background runner workers...")

const workerId = process.env.HOSTNAME || `worker-${Math.random().toString(36).substring(2, 11)}`
let currentJobId: string | null = null
let workerStatus: "idle" | "busy" | "error" = "idle"

export function startTestRunWorker() {
  console.log("[TestRunWorker] started")
  const testRunWorker = new Worker(
    "test-execution-queue",
    async (job) => {
      const { testRunId } = job.data
      console.log(`[TEST RUN WORKER JOB] Received testRunId: ${testRunId}`)
      currentJobId = testRunId
      workerStatus = "busy"

      try {
        await prisma.testJob.upsert({
          where: { testRunId },
          update: {
            status: "Running",
            startedAt: new Date(),
            attempts: job.attemptsMade + 1,
            workerId: workerId,
          },
          create: {
            testRunId,
            status: "Running",
            attempts: 1,
            workerId: workerId,
          },
        })

        await runTestCase({ testRunId, headless: true })
      } catch (err: any) {
        workerStatus = "error"
        console.error(`[TEST RUN WORKER JOB ERROR] Failed run ${testRunId}:`, err.message)
        throw err
      } finally {
        currentJobId = null
        workerStatus = "idle"
      }
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  )

  testRunWorker.on("completed", async (job) => {
    const { testRunId } = job.data
    try {
      await prisma.testJob.update({
        where: { testRunId },
        data: { status: "Completed", completedAt: new Date() },
      })
    } catch (err) {
      console.error("Worker failed to update TestJob to Completed:", err)
    }
  })

  testRunWorker.on("failed", async (job, error) => {
    if (!job) return
    const { testRunId } = job.data
    try {
      await prisma.testJob.update({
        where: { testRunId },
        data: {
          status: "Failed",
          error: error.message,
          completedAt: new Date(),
        },
      })

      await prisma.testRun.update({
        where: { id: testRunId },
        data: {
          status: "Failed",
          completedAt: new Date(),
        },
      })
    } catch (err) {
      console.error("Worker failed to update test run status on failure:", err)
    }
  })

  testRunWorker.on("error", (error) => {
    console.error("[TEST RUN WORKER ERROR] Global error:", error.message)
  })

  return testRunWorker
}

export function startVisualCheckWorker() {
  console.log("[VISUAL WORKER] Starting visual comparison queue processor...")
  const visualCheckWorker = new Worker(
    "visual-check-queue",
    async (job) => {
      const { runId } = job.data
      console.log(`[VISUAL WORKER JOB] Received runId: ${runId}`)
      try {
        const { runVisualCheck } = await import("@/lib/playwright/visual-runner")
        await runVisualCheck({ runId })
      } catch (err: any) {
        console.error(`[VISUAL WORKER JOB ERROR] Failed visual check ${runId}:`, err.message)
        throw err
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  )

  visualCheckWorker.on("completed", (job) => {
    console.log(`[VISUAL WORKER] Completed runId: ${job.data.runId}`)
  })

  visualCheckWorker.on("failed", (job, error) => {
    console.error(`[VISUAL WORKER] Failed runId: ${job?.data.runId}. Error: ${error.message}`)
  })

  visualCheckWorker.on("error", (error) => {
    console.error("[VISUAL WORKER ERROR] Global error:", error.message)
  })

  return visualCheckWorker
}

export function startAgentRunWorker() {
  console.log("[AgentRunWorker] started")
  console.log(`[AgentRunWorker] listening to queue: ${AGENT_RUN_QUEUE_NAME}`)
  const agentRunWorker = new Worker(
    AGENT_RUN_QUEUE_NAME,
    async (job) => {
      const { runId } = job.data
      console.log(`[AgentRunWorker] picked job: ${job.id}, agentRunId=${runId}`)
      
      try {
        // Update database immediately to Scanning / Analyzing
        await prisma.qAAgentRun.update({
          where: { id: runId },
          data: {
            status: "Scanning",
            currentPhase: "Analyzing",
            currentMessage: "Worker picked up job. Starting page analysis...",
            startedAt: new Date(),
            lastHeartbeatAt: new Date(),
            currentPhaseStartedAt: new Date()
          }
        })

        await prisma.qAAgentRunEvent.create({
          data: {
            agentRunId: runId,
            level: "info",
            phase: "Scanning",
            message: "Worker picked job"
          }
        })
        
        await runQAAgentPipeline(runId)
      } catch (err: any) {
        console.error(`[AgentRunWorker] failed QAAgentRun ${runId}: ${err.message}`)
        throw err
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  )

  agentRunWorker.on("completed", (job) => {
    console.log(`[AgentRunWorker] completed QAAgentRun ${job.data.runId}`)
  })

  agentRunWorker.on("failed", async (job, error) => {
    if (!job) return
    const { runId } = job.data
    console.log(`[AgentRunWorker] failed QAAgentRun ${runId}: ${error.message}`)
    try {
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: "Failed",
          completedAt: new Date(),
          currentPhase: "Failed",
          currentMessage: `Agent execution failed: ${error.message}`,
          failedReason: error.message,
          failedAt: new Date(),
          errorStack: error.stack || null,
          currentPhaseStartedAt: new Date()
        }
      })
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: "Risk",
          severity: "High",
          title: "Agent execution failed",
          description: error.message,
          evidence: { error: error.message, stack: error.stack }
        }
      })
    } catch (err) {
      console.error("Worker failed to update QA Agent Run status on failure:", err)
    }
  })

  agentRunWorker.on("error", (error) => {
    console.error("[AGENT WORKER ERROR] Global error:", error.message)
  })

  return agentRunWorker
}

// Instantiate and start all isolated workers
const testRunWorker = startTestRunWorker()
const visualCheckWorker = startVisualCheckWorker()
const agentRunWorker = startAgentRunWorker()
const agentBrainWorker = startAgentBrainWorker()

// Heartbeat Loop (5 seconds interval)
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
    console.error("Worker heartbeat registration failed:", err.message)
  }
}, 5000)

// Inbound integration polling — pulls external status/title changes back into
// local records for projects with inbound sync enabled (fallback for providers
// without webhooks, e.g. OpenProject). Runs every 2 minutes.
const inboundPollInterval = setInterval(async () => {
  try {
    const { pollAllInbound } = await import("@/lib/integrations/core/poll")
    const r = await pollAllInbound()
    if (r.applied > 0) console.log(`[inbound-poll] applied ${r.applied} change(s) across ${r.projects} project(s)`)
  } catch (err: any) {
    console.error("[inbound-poll] failed:", err?.message)
  }
}, 120000)

console.log(`All background workers initialized successfully under process: ${workerId}`)

process.on("SIGTERM", async () => {
  clearInterval(heartbeatInterval)
  clearInterval(inboundPollInterval)
  await testRunWorker.close().catch(() => {})
  await visualCheckWorker.close().catch(() => {})
  await agentRunWorker.close().catch(() => {})
  clearInterval(agentBrainWorker.heartbeatInterval)
  await agentBrainWorker.worker.close().catch(() => {})
  process.exit(0)
})
