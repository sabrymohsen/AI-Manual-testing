import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redisConnection } from "@/lib/queue"
import { Redis } from "ioredis"

export async function GET() {
  const checks = {
    database: false,
    redis: false,
    storage: false,
  }

  let status = 200

  // Check Database
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = true
  } catch (err) {
    checks.database = false
    status = 503
  }

  // Check Redis
  try {
    const redis = new Redis(redisConnection)
    await redis.ping()
    redis.disconnect()
    checks.redis = true
  } catch (err) {
    checks.redis = false
    status = 503
  }

  // Check Storage (basic write check)
  try {
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const storageRoot = process.env.STORAGE_ROOT || "./storage"
    const testFile = path.join(storageRoot, ".health-check")
    await fs.writeFile(testFile, "ok")
    await fs.unlink(testFile)
    checks.storage = true
  } catch (err) {
    checks.storage = false
    status = 503
  }

  const allHealthy = Object.values(checks).every(Boolean)

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}
