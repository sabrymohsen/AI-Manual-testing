import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const tcs = await prisma.testCase.findMany({
    where: { projectId: "edbf4c22-752f-4136-a13d-9f309a5bb33e" },
    select: {
      id: true,
      title: true,
      source: true,
      createdAt: true
    }
  })
  const sources = new Set(tcs.map(tc => tc.source))
  console.log("TestCase sources:", Array.from(sources))
  console.log("TestCase counts by source:")
  for (const src of sources) {
    const count = tcs.filter(tc => tc.source === src).length
    console.log(`- ${src}: ${count}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
