import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const imp = await prisma.requirementImport.findUnique({
    where: { id: "8d8499b1-bd14-422e-abb1-dac3950703a8" },
    select: { parsedItems: true }
  })
  if (!imp || !imp.parsedItems) return
  const items = imp.parsedItems as any[]
  
  // Find any items that have additional properties or link information
  console.log("Keys of the first parsed item:", Object.keys(items[0]))
  
  const itemsWithTcs = items.filter(i => i.testCases || i.testCase || i.tc || i.link || i.links)
  console.log(`Found ${itemsWithTcs.length} items with potential test case references.`)
  if (itemsWithTcs.length > 0) {
    console.log("Sample:", JSON.stringify(itemsWithTcs.slice(0, 2), null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
