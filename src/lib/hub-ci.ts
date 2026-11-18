import { createHash, randomBytes } from "crypto"
import { prisma } from "@/lib/db"

/**
 * CI trigger tokens. A token is shown once at creation; only its SHA-256 hash
 * is stored, so a database leak doesn't hand out working tokens.
 * Format: qae_<random> (the prefix makes it recognisable in logs/secret scanners).
 */

export function newToken() {
  const token = `qae_${randomBytes(24).toString("base64url")}`
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

/** Resolves "Authorization: Bearer <token>" to its project, or null. */
export async function verifyCiRequest(request: Request) {
  const header = request.headers.get("authorization") || ""
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token || !token.startsWith("qae_")) return null
  const row = await prisma.hubTriggerToken.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!row || row.revokedAt) return null
  await prisma.hubTriggerToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return row
}
