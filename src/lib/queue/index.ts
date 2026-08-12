import { Queue, QueueEvents } from "bullmq"
import Redis from "ioredis"

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const REDIS_HOST = process.env.REDIS_HOST || "localhost"
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

// family: 0 lets ioredis resolve over both IPv4 and IPv6. Railway's private
// network (*.railway.internal) is IPv6-only, so this is required to connect to
// REDIS_PRIVATE_URL; it's harmless for the public IPv4 URL.
const IP_FAMILY = 0

function defaultConnection() {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    family: IP_FAMILY,
    maxRetriesPerRequest: null,
  }
}

function connectionOptions() {
  try {
    const url = new URL(REDIS_URL)
    return {
      host: url.hostname || REDIS_HOST,
      port: Number(url.port) || REDIS_PORT,
      password: url.password || REDIS_PASSWORD,
      family: IP_FAMILY,
      maxRetriesPerRequest: null,
    }
  } catch {
    return defaultConnection()
  }
}

const conn = connectionOptions()

export { conn as redisConnection }

/**
 * Redis reachability, tracked from connection events rather than probed.
 *
 * Every ioredis connection here shares one reporting policy: the FIRST failure
 * after a healthy period is logged once, and everything after it is swallowed
 * until a connection succeeds again. Without this the app emitted a stack trace
 * per reconnect per connection — enough to hit Railway's 500 lines/sec cap and
 * burn CPU on log formatting alone, while telling an operator nothing the first
 * line hadn't already said.
 */
let redisReachable = true
let outageLogged = false

export function isRedisReachable(): boolean {
  return redisReachable
}

/** Human-readable reason for the last outage, for health endpoints. */
let lastRedisError = ""
export function lastRedisFailure(): string {
  return lastRedisError
}

function noteRedisDown(err: unknown) {
  redisReachable = false
  lastRedisError = (err as any)?.message || String(err)
  if (!outageLogged) {
    outageLogged = true
    console.warn(
      `[queue] Redis unreachable at ${conn.host}:${conn.port} — background jobs ` +
        `(test execution, visual checks, agent runs) will not run until it is back. ` +
        `Further connection errors are suppressed. Cause: ${lastRedisError}`
    )
  }
}

function noteRedisUp() {
  if (!redisReachable) {
    console.info(`[queue] Redis reachable again at ${conn.host}:${conn.port}`)
  }
  redisReachable = true
  outageLogged = false
  lastRedisError = ""
}

/**
 * Attach the shared reporting policy to anything that emits ioredis-style
 * connection events (Redis clients, BullMQ Queues, QueueEvents). BullMQ's Queue
 * objects had no error listener at all, so their connection errors surfaced as
 * unhandled 'error' events — the actual source of the log flood.
 */
function superviseConnection(emitter: {
  on(event: string, cb: (...args: any[]) => void): unknown
}): void {
  emitter.on("error", (err: unknown) => noteRedisDown(err))
  emitter.on("ready", () => noteRedisUp())
  emitter.on("connect", () => noteRedisUp())
}

// Reconnect forever with a widening backoff instead of giving up after a few
// tries: a queue that stops retrying stays dead until the process restarts, so
// bringing Redis back would not have healed a running container.
function retryStrategy(times: number): number {
  return Math.min(times * 500, 30_000)
}

// Redis Client for general Redis operations (Pub/Sub, Heartbeats, Cancellations)
export const redisClient = new Redis({
  host: conn.host,
  port: conn.port,
  password: conn.password,
  family: IP_FAMILY,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  retryStrategy,
})
superviseConnection(redisClient)

// Factory to create subscription connections
export function createRedisClient(): Redis {
  const client = new Redis({
    host: conn.host,
    port: conn.port,
    password: conn.password,
    family: IP_FAMILY,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy,
  })
  superviseConnection(client)
  return client
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

// Every queue shares the connection-reporting policy above. BullMQ Queue
// objects had no 'error' listener, so a missing Redis surfaced as an unhandled
// error event per reconnect, per queue.
for (const q of [
  testExecutionQueue,
  visualCheckQueue,
  recorderValidationQueue,
  autonomousAgentQueue,
  agentBrainQueue,
  qaAgentQueue,
  queueEvents,
]) {
  superviseConnection(q)
}

/**
 * Thrown when a job cannot be enqueued because Redis is down, so callers can
 * answer "the queue is unavailable" instead of a generic 500.
 */
export class QueueUnavailableError extends Error {
  readonly statusCode = 503
  constructor() {
    super(
      "Background job queue is unavailable — Redis is not reachable, so runs cannot be started."
    )
    this.name = "QueueUnavailableError"
  }
}

/** How long an enqueue may take before the queue is declared unavailable. */
const ENQUEUE_TIMEOUT_MS = Number(process.env.QUEUE_ENQUEUE_TIMEOUT_MS) || 5_000

async function enqueue<T>(op: () => Promise<T>): Promise<T> {
  // ioredis buffers commands while disconnected (enableOfflineQueue defaults to
  // true), so with Redis down `queue.add()` never settles and the HTTP request
  // that started a run hangs until the client gives up. Racing a timeout turns
  // that into an immediate, explainable failure. The buffer is left enabled on
  // purpose: a sub-second reconnect still succeeds instead of erroring.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      op(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new QueueUnavailableError()), ENQUEUE_TIMEOUT_MS)
      }),
    ])
  } catch (err: any) {
    if (err instanceof QueueUnavailableError) throw err
    // ioredis reports an unreachable server as a connection error; anything
    // else is a real BullMQ failure worth surfacing as-is.
    if (
      !isRedisReachable() ||
      /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Connection is closed/i.test(err?.message || "")
    ) {
      throw new QueueUnavailableError()
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// 2. Job Add/Cancel Helpers
export async function addTestRunJob(testRunId: string): Promise<string> {
  const job = await enqueue(() => testExecutionQueue.add("execute-test-run", { testRunId }, {
    jobId: testRunId,
  }))
  return job.id!
}

export async function addAutonomousAgentJob(agentRunId: string): Promise<string> {
  const job = await enqueue(() => autonomousAgentQueue.add("execute-autonomous-run", { agentRunId }, {
    jobId: agentRunId,
  }))
  return job.id!
}

export async function addAgentBrainJob(runId: string): Promise<string> {
  const job = await enqueue(() => agentBrainQueue.add("execute-agent-brain-run", { runId }, {
    jobId: runId,
  }))
  return job.id!
}

export async function addQAAgentJob(runId: string): Promise<string> {
  const job = await enqueue(() => qaAgentQueue.add("execute-qa-agent-run", { runId }, {
    jobId: runId,
  }))
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
