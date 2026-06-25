import { Queue, QueueEvents } from "bullmq"
import Redis from "ioredis"

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

// Redis Client for general Redis operations (Pub/Sub, Heartbeats, Cancellations)
export const redisClient = new Redis({
  host: conn.host,
  port: conn.port,
  password: conn.password,
  maxRetriesPerRequest: null,
})

// Factory to create subscription connections
export function createRedisClient(): Redis {
  return new Redis({
    host: conn.host,
    port: conn.port,
    password: conn.password,
    maxRetriesPerRequest: null,
  })
}

// 1. Queues
export const testExecutionQueue = new Queue("test-execution-queue", {
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

// Backward compatibility alias
export const testRunQueue = testExecutionQueue

export const queueEvents = new QueueEvents("test-execution-queue", { connection: conn })

export const visualCheckQueue = new Queue("visual-check-queue", {
  connection: conn,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export const recorderValidationQueue = new Queue("recorder-validation-queue", {
  connection: conn,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export const autonomousAgentQueue = new Queue("autonomous-agent-queue", {
  connection: conn,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export const agentBrainQueue = new Queue("agent-brain-queue", {
  connection: conn,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export const AGENT_RUN_QUEUE_NAME = "agent-run-queue"

export const qaAgentQueue = new Queue(AGENT_RUN_QUEUE_NAME, {
  connection: conn,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

// 2. Job Add/Cancel Helpers
export async function addTestRunJob(testRunId: string): Promise<string> {
  const job = await testExecutionQueue.add("execute-test-run", { testRunId }, {
    jobId: testRunId,
  })
  return job.id!
}

export async function addAutonomousAgentJob(agentRunId: string): Promise<string> {
  const job = await autonomousAgentQueue.add("execute-autonomous-run", { agentRunId }, {
    jobId: agentRunId,
  })
  return job.id!
}

export async function addAgentBrainJob(runId: string): Promise<string> {
  const job = await agentBrainQueue.add("execute-agent-brain-run", { runId }, {
    jobId: runId,
  })
  return job.id!
}

export async function addQAAgentJob(runId: string): Promise<string> {
  const job = await qaAgentQueue.add("execute-qa-agent-run", { runId }, {
    jobId: runId,
  })
  return job.id!
}

export async function cancelTestRunJob(testRunId: string): Promise<void> {
  const job = await testExecutionQueue.getJob(testRunId)
  if (job) {
    await job.remove()
  }
  await setCancelSignal(testRunId)
}

export async function getJobStatus(testRunId: string): Promise<{
  status: string | undefined
  attempts: number
  error?: string
} | null> {
  const job = await testExecutionQueue.getJob(testRunId)
  if (!job) return null

  const state = await job.getState()
  return {
    status: state,
    attempts: job.attemptsMade,
    error: job.failedReason || undefined,
  }
}

export async function addVisualCheckJob(runId: string): Promise<string> {
  const job = await visualCheckQueue.add("execute-visual-check", { runId }, {
    jobId: runId,
  })
  return job.id!
}

// 3. Real-Time Pub/Sub Events Helpers
export async function publishTestRunEvent(testRunId: string, event: string, data: any = {}) {
  const payload = JSON.stringify({
    testRunId,
    event,
    data,
    timestamp: new Date().toISOString(),
  })
  await redisClient.publish("test-run-events", payload)
}

export async function publishAgentRunEvent(agentRunId: string, event: string, data: any = {}) {
  const payload = JSON.stringify({
    agentRunId,
    event,
    data,
    timestamp: new Date().toISOString(),
  })
  await redisClient.publish("agent-run-events", payload)
}

export async function publishAgentBrainEvent(runId: string, event: string, data: any = {}) {
  const payload = JSON.stringify({
    runId,
    event,
    data,
    timestamp: new Date().toISOString(),
  })
  await redisClient.publish("agent-brain-events", payload)
}

// 4. Cancellation Signal Helpers
export async function setCancelSignal(testRunId: string): Promise<void> {
  await redisClient.set(`test-run:cancel:${testRunId}`, "true", "EX", 3600) // 1 hour expiration
}

export async function isCancelSignalSet(testRunId: string): Promise<boolean> {
  const res = await redisClient.get(`test-run:cancel:${testRunId}`)
  return res === "true"
}

export async function clearCancelSignal(testRunId: string): Promise<void> {
  await redisClient.del(`test-run:cancel:${testRunId}`)
}

export async function setQAAgentCancelSignal(runId: string): Promise<void> {
  await redisClient.set(`qa-agent:cancel:${runId}`, "true", "EX", 3600)
}

export async function isQAAgentCancelSignalSet(runId: string): Promise<boolean> {
  const res = await redisClient.get(`qa-agent:cancel:${runId}`)
  return res === "true"
}

export async function clearQAAgentCancelSignal(runId: string): Promise<void> {
  await redisClient.del(`qa-agent:cancel:${runId}`)
}

export async function cancelQAAgentJob(runId: string): Promise<void> {
  const job = await qaAgentQueue.getJob(runId)
  if (job) {
    await job.remove()
  }
  await setQAAgentCancelSignal(runId)
}

export async function setAgentBrainCancelSignal(runId: string): Promise<void> {
  await redisClient.set(`agent-brain:cancel:${runId}`, "true", "EX", 3600)
}

export async function isAgentBrainCancelSignalSet(runId: string): Promise<boolean> {
  const res = await redisClient.get(`agent-brain:cancel:${runId}`)
  return res === "true"
}

export async function clearAgentBrainCancelSignal(runId: string): Promise<void> {
  await redisClient.del(`agent-brain:cancel:${runId}`)
}

export async function cancelAgentBrainJob(runId: string): Promise<void> {
  const job = await agentBrainQueue.getJob(runId)
  if (job) {
    await job.remove()
  }
  await setAgentBrainCancelSignal(runId)
}

export async function setAutonomousAgentCancelSignal(runId: string): Promise<void> {
  await redisClient.set(`autonomous-agent:cancel:${runId}`, "true", "EX", 3600)
}

export async function isAutonomousAgentCancelSignalSet(runId: string): Promise<boolean> {
  const res = await redisClient.get(`autonomous-agent:cancel:${runId}`)
  return res === "true"
}

export async function clearAutonomousAgentCancelSignal(runId: string): Promise<void> {
  await redisClient.del(`autonomous-agent:cancel:${runId}`)
}

export async function cancelAutonomousAgentJob(runId: string): Promise<void> {
  const job = await autonomousAgentQueue.getJob(runId)
  if (job) {
    await job.remove()
  }
  await setAutonomousAgentCancelSignal(runId)
}

// 5. Worker Heartbeat Helpers
export async function registerWorkerHeartbeat(workerId: string, stats: {
  status: "idle" | "busy" | "error"
  currentJobId?: string | null
  memoryUsage: number
  browserStatus: string
}) {
  const key = `worker:health:${workerId}`
  await redisClient.set(key, JSON.stringify({
    ...stats,
    lastHeartbeat: new Date().toISOString(),
  }), "EX", 15) // Expires in 15 seconds
}

export async function getActiveWorkers(): Promise<any[]> {
  const keys = await redisClient.keys("worker:health:*")
  if (keys.length === 0) return []
  const workers = []
  for (const key of keys) {
    const data = await redisClient.get(key)
    if (data) {
      const workerId = key.replace("worker:health:", "")
      workers.push({
        workerId,
        ...JSON.parse(data),
      })
    }
  }
  return workers
}
