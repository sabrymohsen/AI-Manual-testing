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
  const stepResults = await prisma.testStepResult.findMany({
    where: { testRunId: runId },
    orderBy: { stepNumber: "asc" },
  })

  console.log("Step results for run:", runId)
  for (const step of stepResults) {
    console.log(`Step ${step.stepNumber}: ${step.actionDescription}`)
    console.log(`  Screenshot Before: ${step.screenshotBefore}`)
    console.log(`  Screenshot After: ${step.screenshotAfter}`)
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
