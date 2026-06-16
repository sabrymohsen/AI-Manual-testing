import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const testCase = await prisma.testCase.findUnique({
    where: { id: "ba75ed98-2e1f-4966-9a6f-6947d290e58a" },
    include: {
      steps: {
        orderBy: {
          stepNumber: "asc",
        },
      },
    },
  })

  if (!testCase) {
    console.log("Test case not found")
    return
  }

  for (const step of testCase.steps) {
    if (step.actionType === "click" && step.targetType === "role") {
      const targetValue = step.targetValue || ""
      console.log(`Step ${step.stepNumber} targetValue:`, JSON.stringify(targetValue))
      const match = targetValue.match(/^([^,]+),\s*name:\s*["'](.+)["']$/)
      console.log("match result:", match)
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
