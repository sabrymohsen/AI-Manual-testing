import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const testCases = await prisma.testCase.findMany({
    include: {
      steps: {
        orderBy: {
          stepNumber: "asc",
        },
      },
    },
  })

  console.log(`Found ${testCases.length} Test Cases:`)
  for (const tc of testCases) {
    console.log(`ID: ${tc.id}`)
    console.log(`Title: ${tc.title}`)
    console.log(`Module: ${tc.module}`)
    console.log(`Steps count: ${tc.steps.length}`)
    for (const step of tc.steps) {
      console.log(`  Step ${step.stepNumber}: ${step.actionType} | ${step.targetType} | Target: ${step.targetValue} | Input: ${step.inputValue}`)
    }
    console.log("-".repeat(50))
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
