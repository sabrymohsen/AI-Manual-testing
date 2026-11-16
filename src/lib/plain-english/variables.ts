/**
 * Values a plain-English test can read as {name} when it starts: the project's
 * test data, the test case's own test data (wins over the project's), and the
 * signed-in login as {username} / {password}. Server only.
 */
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export async function loadRunVariables(opts: {
  projectId: string
  environment: string | null
  testCaseTestData: unknown
  credential: { username: string; password: string } | null
}): Promise<Record<string, unknown>> {
  const vars: Record<string, unknown> = {}

  const rows = await prisma.testDataVariable
    .findMany({ where: { projectId: opts.projectId, OR: [{ environment: null }, ...(opts.environment ? [{ environment: opts.environment as any }] : [])] } })
    .catch(() => [])
  // Environment-specific values override the shared ones with the same key.
  for (const r of [...rows].sort((a, b) => (a.environment ? 1 : 0) - (b.environment ? 1 : 0))) {
    let value: string | null = r.value
    if (r.encryptedValue && r.encryptionIv && r.encryptionAuthTag) {
      try {
        value = decryptSecret({ encrypted: r.encryptedValue, iv: r.encryptionIv, authTag: r.encryptionAuthTag, keyVersion: r.keyVersion || "v1" })
      } catch {
        continue
      }
    }
    if (value === null) continue
    vars[r.key] = r.dataType === "number" && value !== "" && !isNaN(Number(value)) ? Number(value) : r.dataType === "json" ? safeJson(value) : value
  }

  const td = opts.testCaseTestData
  if (td && typeof td === "object" && !Array.isArray(td)) {
    for (const [k, v] of Object.entries(td as Record<string, unknown>)) {
      if (/^[A-Za-z_][\w-]*$/.test(k) && v !== undefined) vars[k] = v
    }
  }

  if (opts.credential) {
    vars.username = opts.credential.username
    vars.password = opts.credential.password
  }
  return vars
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
