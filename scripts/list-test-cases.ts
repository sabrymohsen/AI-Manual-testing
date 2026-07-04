import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const tcs = await prisma.testCase.findMany({
    where: { projectId: "edbf4c22-752f-4136-a13d-9f309a5bb33e" },
    select: {
      id: true,
      title: true,
      preconditions: true,
    }
  })
  console.log(`Found ${tcs.length} test cases.`)
  console.log("First 10 test cases:")
  console.log(JSON.stringify(tcs.slice(0, 10), null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
