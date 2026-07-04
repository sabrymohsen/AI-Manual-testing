import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const projectId = "edbf4c22-752f-4136-a13d-9f309a5bb33e"
  const features = await prisma.projectFeature.findMany({
    where: { projectId },
    include: { module: true }
  })
  console.log("Features list:")
  features.forEach(f => {
    console.log(`- Feature: "${f.name}" (ID: ${f.id}) in Module: "${f.module?.name}" (ID: ${f.moduleId})`)
  })

  const tcs = await prisma.testCase.findMany({
    where: { projectId },
    include: { moduleRelation: true, feature: true, component: true }
  })
  console.log(`\nTest Cases count: ${tcs.length}`)
  const sample = tcs.slice(0, 5)
  console.log("Test Cases sample details:")
  sample.forEach(tc => {
    console.log(`- TC: "${tc.title}"`)
    console.log(`  Module: "${tc.moduleRelation?.name}"`)
    console.log(`  Feature: "${tc.feature?.name}"`)
    console.log(`  Component: "${tc.component?.name}"`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
