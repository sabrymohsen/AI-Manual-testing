import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const testRuns = await prisma.testRun.findMany({
    include: {
      testCase: true,
      stepResults: {
        orderBy: {
          stepNumber: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  })

  console.log(`Last 10 Test Runs:`)
  for (const run of testRuns) {
    console.log(`Run ID: ${run.id}`)
    console.log(`Test Case Title: ${run.testCase?.title}`)
    console.log(`Status: ${run.status}`)
    console.log(`Browser: ${run.browserType} | Viewport: ${run.viewport}`)
    console.log(`Steps count: ${run.stepResults.length}`)
    for (const step of run.stepResults) {
      console.log(`  Step ${step.stepNumber}: ${step.actionDescription} | Status: ${step.status} | Error: ${step.errorDetails}`)
    }
    console.log("-".repeat(50))
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
