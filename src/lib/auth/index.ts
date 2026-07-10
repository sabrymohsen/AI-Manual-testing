import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { getTrialDays } from "@/lib/settings"
import { daysToDate } from "@/lib/trial"

// Resolve the secret lazily so importing this module (e.g. during `next build`
// page-data collection) doesn't crash when the env var is only present at runtime.
function requireSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is required")
  }
  return secret
}
const SALT_ROUNDS = 12

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role?: "User" | "Admin"
}

export interface AuthSession {
  user: AuthUser
  token: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Helper functions for base64url encoding/decoding compatible with Edge runtime
function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binString = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binString += String.fromCharCode(bytes[i])
  }
  return btoa(binString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4) {
    base64 += "="
  }
  const binString = atob(base64)
  const bytes = new Uint8Array(binString.length)
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binString = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binString += String.fromCharCode(bytes[i])
  }
  return btoa(binString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// Returns a Uint8Array (a TypedArray) rather than the underlying ArrayBuffer:
// in the Edge runtime a raw `.buffer` can fail SubtleCrypto's cross-realm
// `instanceof ArrayBuffer` check, but a TypedArray is always accepted.
function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4) {
    base64 += "="
  }
  const binString = atob(base64)
  const bytes = new Uint8Array(binString.length)
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i)
  }
  return bytes
}

async function getHMACKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  return globalThis.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function createToken(user: AuthUser): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" }
  const payload = {
    id: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days expiration
  }
  
  const encodedHeader = base64urlEncode(JSON.stringify(header))
  const encodedPayload = base64urlEncode(JSON.stringify(payload))
  
  const tokenInput = `${encodedHeader}.${encodedPayload}`
  const key = await getHMACKey(requireSecret())
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(tokenInput)
  )
  const encodedSignature = arrayBufferToBase64Url(signatureBuffer)
  return `${tokenInput}.${encodedSignature}`
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [encodedHeader, encodedPayload, encodedSignature] = parts
    
    const tokenInput = `${encodedHeader}.${encodedPayload}`
    const key = await getHMACKey(requireSecret())
    const signatureBuffer = base64UrlToUint8Array(encodedSignature)
    
    const isValid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer as BufferSource,
      new TextEncoder().encode(tokenInput)
    )
    
    if (!isValid) {
      console.error("JWT verify signature invalid")
      return null
    }
    
    const payload = JSON.parse(base64urlDecode(encodedPayload))
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      console.error("JWT verify token expired")
      return null
    }
    
    return { id: payload.id, email: payload.email, name: null }
  } catch (err: any) {
    console.error("JWT VERIFY ERROR:", err.message || err)
    return null
  }
}

export async function registerUser(
  email: string,
  password: string,
  name?: string
): Promise<AuthSession> {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error("Email already registered")
  }

  const passwordHash = await hashPassword(password)

  // New signups start on a Pro free trial (configurable in the admin panel).
  // When the trial elapses they are auto-downgraded to Free (see getSession /
  // expireDueTrials). A trial length of 0 means "no trial" → straight to Free.
  const trialDays = await getTrialDays()
  const now = new Date()
  const startsTrial = trialDays > 0
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      plan: startsTrial ? "Pro" : "Free",
      trialStartedAt: startsTrial ? now : null,
      trialEndsAt: startsTrial ? daysToDate(trialDays, now) : null,
    },
  })

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role as "User" | "Admin" }
  const token = await createToken(authUser)

  return { user: authUser, token }
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthSession> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error("Invalid email or password")
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new Error("Invalid email or password")
  }

  if (!user.isActive) {
    throw new Error("Your account has been deactivated. Contact an administrator.")
  }

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role as "User" | "Admin" }
  const token = await createToken(authUser)

  return { user: authUser, token }
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token) return null

  const user = await verifyToken(token)
  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, role: true, isActive: true, plan: true, trialEndsAt: true },
  })
  if (!dbUser || dbUser.isActive === false) return null

  // Lazily downgrade this user if their Pro trial has elapsed (paid Pro users
  // have trialEndsAt = null and are unaffected).
  if (dbUser.plan === "Pro" && dbUser.trialEndsAt && dbUser.trialEndsAt.getTime() <= Date.now()) {
    await prisma.user.update({ where: { id: dbUser.id }, data: { plan: "Free" } })
  }

  const authUser: AuthUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as "User" | "Admin"
  }

  return { user: authUser, token }
}

export function setSessionCookie(token: string): void {
  const cookieStore = cookies()
  cookieStore.set("session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  })
}

export function clearSessionCookie(): void {
  const cookieStore = cookies()
  cookieStore.delete("session_token")
}
