import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Querying RequirementImports...")
  const imports = await prisma.requirementImport.findMany({
    select: {
      id: true,
      projectId: true,
      fileName: true,
      status: true,
      createdAt: true,
      summary: true,
    }
  })
  console.log("Found imports:", JSON.stringify(imports, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
