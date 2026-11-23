/**
 * A BRD's test users: the people of the system it describes (applicant,
 * reviewer…) with the logins the tests use.
 *
 * Generated test cases write each step as "As <key>: …" and refer to the
 * login as {<key>_username} / {<key>_password}; the Browser Agent opens one
 * browser per user and fills the placeholders. Passwords are encrypted at rest,
 * never sent to the AI, and leave the server only for a run on the tester's
 * own computer.
 */
import { z } from "zod"
import { prisma } from "@/lib/db"
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@/lib/crypto"

/** A user key as steps write it: one word, letters first (Arabic allowed). */
export const USER_KEY = /^[\p{L}][\p{L}\p{N}_-]{0,29}$/u

const optionalUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "The login page must start with http:// or https://")
  .optional()
  .nullable()

/** What the BRD Hub sends to add or edit a user. */
export const userSchema = z.object({
  role: z.string().trim().min(1, "Write the role").max(80),
  key: z.string().trim().regex(USER_KEY, "The key is one word (letters, numbers, _ or -), like reviewer").optional(),
  username: z.string().trim().min(1, "Write the username").max(200),
  password: z.string().max(500).optional(),
  loginUrl: optionalUrl,
  notes: z.string().max(2000).optional().nullable(),
})

/** "Case worker" → "case_worker", "المراجع" → "المراجع"; unique among `taken`. */
export function userKey(role: string, taken: string[] = []): string {
  let base = role
    .trim()
    .replace(/^(?:the|an?)\s+/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^[_\p{N}]+|_+$/gu, "")
    .slice(0, 26)
  if (!base || !/^\p{L}/u.test(base)) base = "user"
  const used = new Set(taken.map((t) => t.toLowerCase()))
  let key = base
  for (let i = 2; used.has(key.toLowerCase()); i++) key = `${base}_${i}`
  return key
}

/** The placeholders a user's login is written as in steps and test data. */
export const loginNames = (key: string) => ({ username: `${key}_username`, password: `${key}_password` })

/**
 * Roles the BRD mentions, from its requirements: "As a case worker, I want…",
 * "بصفتي مقدم الطلب، أرغب…", "The reviewer approves…" is left to the tester.
 */
export function suggestRoles(texts: string[]): string[] {
  const found = new Map<string, string>()
  const add = (r: string) => {
    const role = r.replace(/\s+/g, " ").replace(/[,،.:;]+$/, "").trim()
    if (role.length < 2 || role.length > 40 || role.split(" ").length > 4) return
    const k = role.toLowerCase()
    if (!found.has(k)) found.set(k, role)
  }
  for (const t of texts) {
    for (const m of t.matchAll(/\bas an?\s+([A-Za-z][A-Za-z -]{1,40}?)\s*(?:,|\bI\b|\bwant\b|\bshould\b|\bcan\b)/gi)) add(m[1])
    for (const m of t.matchAll(/(?:بصفتي|بصفته|بصفتها|بصفة)\s+([^\s،,.:؛]+(?:\s+[^\s،,.:؛]+)?)\s*[،,]?\s*(?:أرغب|أريد|يرغب|يريد|أستطيع|يستطيع|يجب|يمكن)?/g)) add(m[1])
  }
  return Array.from(found.values()).slice(0, 20)
}

export interface PublicTestUser {
  id: string
  role: string
  key: string
  username: string
  hasPassword: boolean
  loginUrl: string | null
  notes: string | null
  updatedAt: Date
}

type Row = { id: string; role: string; key: string; username: string; passwordEncrypted: unknown; loginUrl: string | null; notes: string | null; updatedAt: Date }

export function publicUser(u: Row): PublicTestUser {
  return { id: u.id, role: u.role, key: u.key, username: u.username, hasPassword: !!u.passwordEncrypted, loginUrl: u.loginUrl, notes: u.notes, updatedAt: u.updatedAt }
}

export const encryptPassword = (pw: string) => encryptSecret(pw) as unknown as object

function password(u: Row): string {
  try {
    return u.passwordEncrypted ? decryptSecret(u.passwordEncrypted as EncryptedSecret) : ""
  } catch {
    return ""
  }
}

/** The users of these BRDs (in this project), with logins decrypted. First BRD wins a shared key. */
export async function loginsForBrds(projectId: string, brdIds: string[]) {
  if (!brdIds.length) return []
  const rows = await prisma.brdTestUser.findMany({
    where: { brdId: { in: brdIds.slice(0, 20) }, brd: { projectId, isDeleted: false } },
    orderBy: { createdAt: "asc" },
  })
  const seen = new Set<string>()
  const out: { key: string; role: string; username: string; password: string; loginUrl: string | null }[] = []
  for (const id of brdIds) {
    for (const u of rows.filter((r) => r.brdId === id)) {
      if (seen.has(u.key)) continue
      seen.add(u.key)
      out.push({ key: u.key, role: u.role, username: u.username, password: password(u), loginUrl: u.loginUrl })
    }
  }
  return out
}

/** {name: value} for filling steps: {reviewer_username}, {reviewer_password}. */
export function loginValues(users: { key: string; username: string; password: string }[]) {
  const values: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const u of users) {
    const n = loginNames(u.key)
    values[n.username] = u.username
    values[n.password] = u.password
    if (u.password) secrets[n.password] = u.password
  }
  return { values, secrets }
}
