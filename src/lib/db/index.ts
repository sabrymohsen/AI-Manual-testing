import { PrismaClient } from "@prisma/client"
import { migrateHierarchy } from "./migrate-hierarchy"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// Trigger auto-migration on load
migrateHierarchy().catch((err) => console.error("[migration] Failed auto-migrating hierarchy:", err))

