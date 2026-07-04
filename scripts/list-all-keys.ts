import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const imp = await prisma.requirementImport.findUnique({
    where: { id: "8d8499b1-bd14-422e-abb1-dac3950703a8" },
    select: { parsedItems: true }
  })
  if (!imp || !imp.parsedItems) return
  const items = imp.parsedItems as any[]
  
  const allKeys = new Set<string>()
  items.forEach(item => {
    Object.keys(item).forEach(k => allKeys.add(k))
  })
  console.log("All unique keys in parsedItems:", Array.from(allKeys))
  
  // Let's also print some values for status and priority to see how they look
  const priorities = new Set(items.map(i => i.priority))
  const statuses = new Set(items.map(i => i.status))
  console.log("Priorities found:", Array.from(priorities))
  console.log("Statuses found:", Array.from(statuses))
}

main().catch(console.error).finally(() => prisma.$disconnect())
