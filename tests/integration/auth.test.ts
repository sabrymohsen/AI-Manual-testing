import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  prismaTest,
  mockCookieStore,
  resetDatabase,
  createTestUser,
} from "./setup"

vi.mock("next/headers", () => ({
  cookies: () => mockCookieStore,
}))

vi.mock("@/lib/db", () => ({
  prisma: prismaTest,
}))

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 100, resetTime: Date.now() + 60000 }),
  getClientIdentifier: vi.fn().mockReturnValue("127.0.0.1"),
}))

import { POST as registerPOST } from "@/app/api/auth/register/route"
import { POST as loginPOST } from "@/app/api/auth/login/route"
import { GET as meGET } from "@/app/api/auth/me/route"

describe("Auth API", () => {
  beforeEach(async () => {
    await resetDatabase()
    mockCookieStore.clear()
  })

  describe("POST /api/auth/register", () => {
    it("should register a new user with valid data", async () => {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "password123",
          name: "New User",
        }),
      })

      const res = await registerPOST(req)
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.user.email).toBe("newuser@example.com")
      expect(body.user.name).toBe("New User")
      expect(body.csrfToken).toBeDefined()

      const dbUser = await prismaTest.user.findUnique({
        where: { email: "newuser@example.com" },
      })
      expect(dbUser).not.toBeNull()
    })

    it("should return 409 for duplicate email", async () => {
      await createTestUser("existing@example.com", "password123", "Existing User")

      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "password123",
          name: "Duplicate User",
        }),
      })

      const res = await registerPOST(req)
      expect(res.status).toBe(409)

      const body = await res.json()
      expect(body.error).toBe("Email already registered")
    })
  })

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials", async () => {
      await createTestUser("login@example.com", "password123", "Login User")

      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login@example.com",
          password: "password123",
        }),
      })

      const res = await loginPOST(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.user.email).toBe("login@example.com")
      expect(body.csrfToken).toBeDefined()
    })

    it("should return 401 for invalid credentials", async () => {
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          password: "wrongpassword",
        }),
      })

      const res = await loginPOST(req)
      expect(res.status).toBe(401)

      const body = await res.json()
      expect(body.error).toBe("Invalid email or password")
    })
  })

  describe("GET /api/auth/me", () => {
    it("should return 401 when not authenticated", async () => {
      const res = await meGET()
      expect(res.status).toBe(401)

      const body = await res.json()
      expect(body.error).toBe("Not authenticated")
    })

    it("should return user data when authenticated", async () => {
      const user = await createTestUser(
        "me@example.com",
        "password123",
        "Me User"
      )

      const { createToken } = await import("@/lib/auth")
      const token = await createToken({ id: user.id, email: user.email, name: user.name })
      mockCookieStore.set("session_token", token)

      const res = await meGET()
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.user.email).toBe("me@example.com")
      expect(body.user.name).toBe("Me User")
    })
  })
})
