import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const projectId = "edbf4c22-752f-4136-a13d-9f309a5bb33e"
  const modules = await prisma.projectModule.findMany({ where: { projectId } })
  const features = await prisma.projectFeature.findMany({ where: { projectId } })
  const components = await prisma.projectComponent.findMany({ where: { projectId } })
  console.log(`Modules count: ${modules.length}`)
  console.log(`Features count: ${features.length}`)
  console.log(`Components count: ${components.length}`)
  if (modules.length > 0) {
    console.log("Modules sample:", modules.map(m => m.name))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
