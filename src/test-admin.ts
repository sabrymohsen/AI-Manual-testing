import { prisma } from "./lib/db"

async function test() {
  const user = await prisma.user.findUnique({
    where: { email: "admin@example.com" }
  })
  console.log("User:", user?.email ?? "admin@example.com not found")
  const projects = await prisma.project.findMany({ select: { id: true, name: true } })
  console.log("Projects:", projects)
}

test().finally(() => prisma.$disconnect())
