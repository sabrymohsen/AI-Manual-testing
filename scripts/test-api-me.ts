import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@example.com"
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, plan: true, role: true }
  })
  console.log("Database user for admin@example.com:")
  console.log(JSON.stringify(user, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
