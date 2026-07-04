/**
 * Flip a user's plan until real billing exists.
 *
 *   npx tsx scripts/set-plan.ts user@example.com Pro
 *   npx tsx scripts/set-plan.ts user@example.com Free
 */
import { prisma } from "../src/lib/db"

async function main() {
  const [email, plan] = process.argv.slice(2)
  if (!email || !["Free", "Pro"].includes(plan)) {
    console.error("Usage: npx tsx scripts/set-plan.ts <email> <Free|Pro>")
    process.exit(1)
  }
  const user = await prisma.user.update({
    where: { email },
    data: { plan: plan as "Free" | "Pro" },
    select: { email: true, plan: true },
  })
  console.log(`Updated ${user.email} → ${user.plan}`)
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
