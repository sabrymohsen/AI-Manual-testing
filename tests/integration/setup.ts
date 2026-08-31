import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL
  }

  const baseUrl = process.env.DATABASE_URL
  if (baseUrl) {
    const url = new URL(baseUrl)
    url.pathname = url.pathname.replace(/\/([^/]+)$/, "/$1_test")
    return url.toString()
  }

  return "postgresql://qa_user:qa_password@localhost:5432/ai_manual_qa_tester_test"
}

export const TEST_DATABASE_URL = getTestDatabaseUrl()

export const prismaTest = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DATABASE_URL,
    },
  },
})

class MockCookieStoreImpl {
  private store = new Map<string, string>()

  get(name: string) {
    const value = this.store.get(name)
    return value !== undefined ? { name, value } : undefined
  }

  getAll() {
    return Array.from(this.store.entries()).map(([name, value]) => ({ name, value }))
  }

  set(name: string, value: string, _options?: any) {
    this.store.set(name, value)
  }

  delete(name: string) {
    this.store.delete(name)
  }

  has(name: string) {
    return this.store.has(name)
  }

  clear() {
    this.store.clear()
  }
}

export const mockCookieStore = new MockCookieStoreImpl()

// Ensure required env vars are set for auth & csrf
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = "test-secret-key-for-integration-tests-only"
}

/**
 * Empty every table between tests.
 *
 * ONE statement, not a loop. TRUNCATE takes an ACCESS EXCLUSIVE lock on each
 * table it touches, and pg_tables returns them in no particular order, so two
 * test files resetting at the same time grabbed the same locks in different
 * orders and deadlocked — Postgres killed one of them and the run failed with
 * "deadlock detected" on whichever test happened to be mid-flight.
 *
 * Listing every table in a single TRUNCATE makes Postgres acquire the whole
 * lock set as one unit, so concurrent resets queue behind each other instead of
 * forming a cycle. The names are sorted as well, so every worker issues the
 * identical statement.
 *
 * CASCADE is still required: the tables reference each other, and truncating a
 * parent without its children is rejected.
 */
export async function resetDatabase() {
  const tables = await prismaTest.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `
  const names = tables
    .map((t) => t.tablename)
    .filter((name) => name !== "_prisma_migrations")
    .sort()

  if (names.length === 0) return

  const list = names.map((name) => `"public"."${name}"`).join(", ")
  await prismaTest.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE;`)
}

export async function createTestUser(
  email: string,
  password: string,
  name?: string
) {
  const passwordHash = await bcrypt.hash(password, 12)
  return prismaTest.user.create({
    data: { email, passwordHash, name: name || null },
  })
}

export async function loginAsUser(userId: string, email: string) {
  const { createToken } = await import("@/lib/auth")
  const token = await createToken({ id: userId, email, name: null })
  mockCookieStore.set("session_token", token)
  return token
}
