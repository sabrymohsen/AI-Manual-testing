import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function test() {
  try {
    console.log("Checking prisma.sprint model...")
    const count = await prisma.sprint.count()
    console.log(`Current sprint count: ${count}`)
    
    console.log("Querying sprints...")
    const sprints = await prisma.sprint.findMany()
    console.log("Sprints found:", sprints)
    
    console.log("SUCCESS!")
  } catch (err: any) {
    console.error("FAIL:", err.message, err.stack)
  } finally {
    await prisma.$disconnect()
  }
}

test()
