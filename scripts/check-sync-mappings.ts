import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const mappings = await prisma.externalSyncMapping.findMany({
    where: { projectId: "edbf4c22-752f-4136-a13d-9f309a5bb33e" }
  })
  console.log(`Found ${mappings.length} sync mappings.`)
  if (mappings.length > 0) {
    console.log("Sample mappings:")
    console.log(JSON.stringify(mappings.slice(0, 10), null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
