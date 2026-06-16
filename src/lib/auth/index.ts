import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret-do-not-use-in-production"
const SALT_ROUNDS = 12

export interface AuthUser {
  id: string
  email: string
  name: string | null
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

export function createToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, email: user.email }, NEXTAUTH_SECRET, {
    expiresIn: "7d",
  })
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, NEXTAUTH_SECRET) as {
      id: string
      email: string
    }
    return { id: decoded.id, email: decoded.email, name: null }
  } catch {
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
  const token = createToken(authUser)

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
  const token = createToken(authUser)

  return { user: authUser, token }
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token) return null

  const user = verifyToken(token)
  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true },
  })
  if (!dbUser) return null

  return { user: dbUser, token }
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
