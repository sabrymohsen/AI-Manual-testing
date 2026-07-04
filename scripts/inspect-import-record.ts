import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const imp = await prisma.requirementImport.findUnique({
    where: { id: "8d8499b1-bd14-422e-abb1-dac3950703a8" }
  })
  console.log("Entire import record:")
  console.log(JSON.stringify(imp, (key, value) => {
    if (key === "parsedItems" && Array.isArray(value)) {
      return `[Array of ${value.length} items]`
    }
    return value
  }, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
