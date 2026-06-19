import { Worker } from "bullmq"
import { redisConnection, registerWorkerHeartbeat } from "@/lib/queue"
import { runTestCase } from "@/lib/playwright/runner"
import { prisma } from "@/lib/db"

console.log("[WORKER STARTUP] Starting test runner worker process...")

const workerId = process.env.HOSTNAME || `worker-${Math.random().toString(36).substring(2, 11)}`
let currentJobId: string | null = null
let workerStatus: "idle" | "busy" | "error" = "idle"

const worker = new Worker(
  "test-execution-queue",
  async (job) => {
    const { testRunId } = job.data
    console.log(`[WORKER JOB] Received testRunId: ${testRunId}`)
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

worker.on("completed", async (job) => {
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

worker.on("failed", async (job, error) => {
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

worker.on("error", (error) => {
  console.error("Worker error:", error.message)
})

// Visual Check Worker
const visualCheckWorker = new Worker(
  "visual-check-queue",
  async (job) => {
    const { runId } = job.data
    console.log(`[VISUAL WORKER] Received runId: ${runId}`)

    const { runVisualCheck } = await import("@/lib/playwright/visual-runner")
    await runVisualCheck({ runId })
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
  console.error("Visual Worker error:", error.message)
})

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

console.log(`Test runner worker (${workerId}) and visual check worker started`)

process.on("SIGTERM", async () => {
  clearInterval(heartbeatInterval)
  await worker.close()
  await visualCheckWorker.close()
  process.exit(0)
})
