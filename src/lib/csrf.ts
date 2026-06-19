import crypto from "node:crypto"

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.NEXTAUTH_SECRET || "csrf-fallback-secret"

export function generateCsrfToken(): string {
  const token = crypto.randomBytes(32).toString("hex")
  const signature = crypto.createHmac("sha256", CSRF_SECRET).update(token).digest("hex")
  return `${token}.${signature}`
}

export function verifyCsrfToken(token: string): boolean {
  const parts = token.split(".")
  if (parts.length !== 2) return false
  const [value, signature] = parts
  const expected = crypto.createHmac("sha256", CSRF_SECRET).update(value).digest("hex")
  return signature === expected
}
