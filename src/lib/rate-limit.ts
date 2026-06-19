import { Redis } from "ioredis"

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379")

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
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const key = `${opts.keyPrefix}:${identifier}`
  const now = Date.now()
  const windowStart = now - opts.windowMs

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
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || "unknown"
  return ip
}
