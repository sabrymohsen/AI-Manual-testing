import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redisConnection } from "@/lib/queue"
import { Redis } from "ioredis"
import { checkStorageHealth } from "@/lib/storage-health"

export async function GET() {
  const checks = {
    database: false,
    redis: false,
    storage: false,
    storagePersistent: false,
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
    const redis = new Redis({
      ...redisConnection,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
    })
    redis.on("error", () => {})
    await redis.ping()
    redis.disconnect()
    checks.redis = true
  } catch (err) {
    checks.redis = false
    status = 503
  }

  // Check Storage: writable *and* persistent. Writability alone is not enough —
  // an ephemeral container filesystem is perfectly writable and still loses
  // every upload on the next deploy.
  const storage = await checkStorageHealth()
  checks.storage = storage.writable
  checks.storagePersistent = storage.writable && !storage.looksEphemeral
  if (!storage.writable) status = 503

  const allHealthy = Object.values(checks).every(Boolean)

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      checks,
      storage: {
        // Absolute path deliberately omitted — this endpoint is unauthenticated.
        persistedSince: storage.markerCreatedAt,
        looksEphemeral: storage.looksEphemeral,
        referencedFiles: storage.referencedFiles,
        error: storage.error,
      },
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}
