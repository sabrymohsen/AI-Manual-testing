// Visual test worker — consumes visual-test-queue (whole-site and URL-list
// screenshot runs). Started as an import side effect from ./index.ts.
import { Worker } from "bullmq"
import { redisConnection, VISUAL_TEST_QUEUE_NAME } from "@/lib/queue"
import { prisma } from "@/lib/db"

export function startVisualTestWorker() {
  console.log(`[VisualTestWorker] listening to queue: ${VISUAL_TEST_QUEUE_NAME}`)
  const worker = new Worker(
    VISUAL_TEST_QUEUE_NAME,
    async job => {
      const { runId } = job.data as { runId: string }
      const { runVisualTestRun } = await import("@/lib/visual-tests/runner")
      await runVisualTestRun(runId)
    },
    // Each run already opens two pages at a time per browser; two runs at once
    // is four Playwright pages, which a single worker container handles.
    { connection: redisConnection, concurrency: 2, lockDuration: 120_000 }
  )

  worker.on("failed", async (job, error) => {
    if (!job) return
    console.error(`[VisualTestWorker] run ${job.data.runId} failed: ${error.message}`)
    // The runner marks the run Failed itself; this covers a crash before it could.
    await prisma.visualTestRun
      .updateMany({
        where: { id: job.data.runId, status: { in: ["Queued", "Running"] } },
        data: { status: "Failed", completedAt: new Date(), error: error.message },
      })
      .catch(() => {})
  })
  worker.on("error", err => console.error("[VisualTestWorker] error:", err.message))
  return worker
}

const visualTestWorker = startVisualTestWorker()

process.on("SIGTERM", async () => {
  await visualTestWorker.close().catch(() => {})
})
