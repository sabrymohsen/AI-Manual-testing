import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const runId = "c20036dd-3a2d-4b71-a918-374c09ca13cd"
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    include: {
      testCase: {
        include: {
          steps: {
            orderBy: {
              stepNumber: "asc",
            },
          },
        },
      },
    },
  })

  if (!run || !run.testCase) {
    console.log("Run or test case not found")
    return
  }

  console.log("Run ID:", runId)
  console.log("TestCase ID:", run.testCase.id)
  console.log("TestCase Title:", run.testCase.title)
  for (const step of run.testCase.steps) {
    console.log(`Step ${step.stepNumber}:`)
    console.log(`  actionType: ${JSON.stringify(step.actionType)}`)
    console.log(`  targetType: ${JSON.stringify(step.targetType)}`)
    console.log(`  targetValue: ${JSON.stringify(step.targetValue)}`)
    console.log(`  inputValue: ${JSON.stringify(step.inputValue)}`)
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
