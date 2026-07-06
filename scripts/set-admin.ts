import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@example.com"
  console.log(`Setting user ${email} role to Admin...`)

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`User with email ${email} not found! Run npm run db:seed first.`)
    return
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role: "Admin" }
  })

  console.log(`Successfully updated ${email} to role: ${updated.role}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
