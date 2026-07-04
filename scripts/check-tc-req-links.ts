import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const links = await prisma.testCaseRequirement.findMany()
  console.log(`Found ${links.length} total test case requirement links in the entire database.`)
  if (links.length > 0) {
    console.log("Sample links:")
    console.log(JSON.stringify(links.slice(0, 5), null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
