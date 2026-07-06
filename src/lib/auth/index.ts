import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
if (!NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is required")
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

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4) {
    base64 += "="
  }
  const binString = atob(base64)
  const bytes = new Uint8Array(binString.length)
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i)
  }
  return bytes.buffer
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
  const key = await getHMACKey(NEXTAUTH_SECRET!)
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
    const key = await getHMACKey(NEXTAUTH_SECRET!)
    const signatureBuffer = base64UrlToArrayBuffer(encodedSignature)
    
    const isValid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
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
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  })

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name }
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

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name }
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
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })
  if (!dbUser || dbUser.isActive === false) return null

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
