// Creates (or promotes) a super admin account against whatever database
// DATABASE_URL points at. Usage:
//
//   DATABASE_URL="postgresql://..." \
//   ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="..." ADMIN_NAME="..." \
//   npx tsx scripts/create-super-admin.ts
//
// If the user already exists, only role/plan/isActive are updated and the
// password is reset to ADMIN_PASSWORD.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? "Super Admin"

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD env vars are required")
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: "Admin",
      plan: "Pro",
      isActive: true,
      trialEndsAt: null, // paid-style Pro: never auto-downgrades
    },
    update: {
      passwordHash,
      role: "Admin",
      plan: "Pro",
      isActive: true,
      trialEndsAt: null,
    },
  })

  console.log(
    `Super admin ready: ${user.email} (id=${user.id}, role=${user.role}, plan=${user.plan})`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
