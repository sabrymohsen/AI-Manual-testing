import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const imp = await prisma.requirementImport.findUnique({
    where: { id: "8d8499b1-bd14-422e-abb1-dac3950703a8" },
    select: { parsedItems: true }
  })
  if (!imp || !imp.parsedItems) {
    console.log("No parsed items found.")
    return
  }
  const items = imp.parsedItems as any[]
  console.log(`Found ${items.length} parsed items.`)
  console.log("First 3 items:")
  console.log(JSON.stringify(items.slice(0, 3), null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
