import { Worker } from "bullmq"
import { redisConnection } from "@/lib/queue"
import { runTestCase } from "@/lib/playwright/runner"
import { prisma } from "@/lib/db"

console.log("[WORKER STARTUP] Starting test runner worker process...")

const worker = new Worker(
  "test-runs",
  async (job) => {
    const { testRunId } = job.data
    console.log(`[WORKER JOB] Received testRunId: ${testRunId}`)

    await prisma.testJob.upsert({
      where: { testRunId },
      update: {
        status: "Running",
        startedAt: new Date(),
        attempts: job.attemptsMade + 1,
        workerId: process.env.HOSTNAME || "unknown",
      },
      create: {
        testRunId,
        status: "Running",
        attempts: 1,
        workerId: process.env.HOSTNAME || "unknown",
      },
    })

    await runTestCase({ testRunId, headless: true })
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
)

worker.on("completed", async (job) => {
  const { testRunId } = job.data
  await prisma.testJob.update({
    where: { testRunId },
    data: { status: "Completed", completedAt: new Date() },
  })
})

worker.on("failed", async (job, error) => {
  if (!job) return
  const { testRunId } = job.data
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
})

worker.on("error", (error) => {
  console.error("Worker error:", error.message)
})

console.log("Test runner worker started")

process.on("SIGTERM", async () => {
  await worker.close()
  process.exit(0)
})
