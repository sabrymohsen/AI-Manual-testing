import { Redis } from "ioredis"

// Fail fast instead of the default 20-retry hang when Redis is unreachable, and
// don't queue commands while offline so calls reject quickly and we can fail open.
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 3000,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
})

// Without a listener, ioredis "error" events can crash the process.
redis.on("error", () => {
  // Swallow connection errors; checkRateLimit degrades to fail-open below.
})

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  keyPrefix?: string
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyPrefix: "ratelimit",
}

export async function checkRateLimit(
  identifier: string,
  options: Partial<RateLimitOptions> = {}
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  if (process.env.NODE_ENV === "test" || process.env.DISABLE_RATE_LIMITS === "true") {
    return { allowed: true, remaining: 9999, resetTime: Date.now() + (options.windowMs || 60000) }
  }

  const opts = { ...DEFAULT_OPTIONS, ...options }
  const key = `${opts.keyPrefix}:${identifier}`
  const now = Date.now()
  const windowStart = now - opts.windowMs

  try {
    // Remove old entries outside the window
    await redis.zremrangebyscore(key, 0, windowStart)

    // Count current requests in window
    const currentCount = await redis.zcard(key)

    if (currentCount >= opts.maxRequests) {
      const oldest = await redis.zrange(key, 0, 0, "WITHSCORES")
      const resetTime = oldest.length > 1 ? parseInt(oldest[1]) + opts.windowMs : now + opts.windowMs
      return { allowed: false, remaining: 0, resetTime }
    }

    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`)
    await redis.pexpire(key, opts.windowMs)

    const remaining = opts.maxRequests - currentCount - 1
    return { allowed: true, remaining, resetTime: now + opts.windowMs }
  } catch (error) {
    // Fail open: if Redis is unavailable, allow the request rather than break
    // the endpoint. Rate limiting is a best-effort control, not a hard gate.
    console.warn("[rate-limit] Redis unavailable, allowing request:", error instanceof Error ? error.message : error)
    return { allowed: true, remaining: opts.maxRequests, resetTime: now + opts.windowMs }
  }
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || "unknown"
  return ip
}
