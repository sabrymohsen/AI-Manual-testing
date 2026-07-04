import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const imp = await prisma.requirementImport.findUnique({
    where: { id: "8d8499b1-bd14-422e-abb1-dac3950703a8" },
    select: { parsedItems: true }
  })
  if (!imp || !imp.parsedItems) {
    console.log("No import found.")
    return
  }
  const items = imp.parsedItems as any[]
  const reqKeys = items.map(i => i.requirementKey).filter(Boolean)
  console.log("Requirement keys in import:", reqKeys.slice(0, 20))

  const tcs = await prisma.testCase.findMany({
    where: { projectId: "edbf4c22-752f-4136-a13d-9f309a5bb33e" },
    select: { title: true }
  })
  const tcKeys = tcs.map(tc => {
    const match = tc.title.match(/^(TC-F\d+-\d+)/)
    return match ? match[1] : null
  }).filter(Boolean)
  console.log("Test Case keys derived from title:", tcKeys.slice(0, 20))
}

main().catch(console.error).finally(() => prisma.$disconnect())
