import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const latestRun = await prisma.testRun.findFirst({
    orderBy: { createdAt: "desc" },
  })
  if (!latestRun) {
    console.log("No test runs found")
    return
  }
  const runId = latestRun.id
  console.log("Logs for Run ID:", runId)

  const logs = await prisma.log.findMany({
    where: { testRunId: runId },
    orderBy: { timestamp: "asc" },
  })

  console.log(`Found ${logs.length} log entries:`)
  for (const log of logs) {
    console.log(`[${log.timestamp.toISOString()}] [${log.source}] [${log.level}] ${log.message}`)
  }

  const networkLogs = await prisma.networkLog.findMany({
    where: { testRunId: runId },
    orderBy: { timestamp: "asc" },
  })

  console.log(`\nFound ${networkLogs.length} network log entries:`)
  for (const nl of networkLogs) {
    console.log(`[${nl.timestamp.toISOString()}] ${nl.method} ${nl.url} -> Status: ${nl.status} | Error: ${nl.error}`)
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
