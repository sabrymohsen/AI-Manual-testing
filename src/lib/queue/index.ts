import { Queue, QueueEvents } from "bullmq"

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const REDIS_HOST = process.env.REDIS_HOST || "localhost"
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

function defaultConnection() {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
  }
}

function connectionOptions() {
  try {
    const url = new URL(REDIS_URL)
    return {
      host: url.hostname || REDIS_HOST,
      port: Number(url.port) || REDIS_PORT,
      password: url.password || REDIS_PASSWORD,
    }
  } catch {
    return defaultConnection()
  }
}

const conn = connectionOptions()

export { conn as redisConnection }

export const testRunQueue = new Queue("test-runs", {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export const queueEvents = new QueueEvents("test-runs", { connection: conn })

export async function addTestRunJob(testRunId: string): Promise<string> {
  const job = await testRunQueue.add("execute-test-run", { testRunId }, {
    jobId: testRunId,
  })
  return job.id!
}

export async function cancelTestRunJob(testRunId: string): Promise<void> {
  const job = await testRunQueue.getJob(testRunId)
  if (job) {
    await job.remove()
  }
}

export async function getJobStatus(testRunId: string): Promise<{
  status: string | undefined
  attempts: number
  error?: string
} | null> {
  const job = await testRunQueue.getJob(testRunId)
  if (!job) return null

  const state = await job.getState()
  return {
    status: state,
    attempts: job.attemptsMade,
    error: job.failedReason || undefined,
  }
}
