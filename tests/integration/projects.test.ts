import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  prismaTest,
  mockCookieStore,
  resetDatabase,
  createTestUser,
  loginAsUser,
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

import { GET as projectsGET, POST as projectsPOST } from "@/app/api/projects/route"
import {
  GET as projectGET,
  PUT as projectPUT,
  DELETE as projectDELETE,
} from "@/app/api/projects/[projectId]/route"

describe("Projects API", () => {
  beforeEach(async () => {
    await resetDatabase()
    mockCookieStore.clear()
  })

  describe("GET /api/projects", () => {
    it("should return 401 without authentication", async () => {
      const req = new Request("http://localhost/api/projects")
      const res = await projectsGET(req as any)
      expect(res.status).toBe(401)
    })

    it("should fetch projects list for authenticated user", async () => {
      const user = await createTestUser("projects@example.com", "password123", "Project User")
      await loginAsUser(user.id, user.email)

      await prismaTest.project.create({
        data: {
          name: "Test Project",
          webAppUrl: "https://example.com",
          userId: user.id,
          status: "Active",
        },
      })

      const req = new Request("http://localhost/api/projects")
      const res = await projectsGET(req as any)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.items.length).toBe(1)
      expect(body.items[0].name).toBe("Test Project")
    })
  })

  describe("POST /api/projects", () => {
    it("should create a project", async () => {
      const user = await createTestUser("create@example.com", "password123", "Create User")
      await loginAsUser(user.id, user.email)

      const req = new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Project",
          webAppUrl: "https://newproject.com",
          environment: "Staging",
        }),
      })

      const res = await projectsPOST(req)
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.project.name).toBe("New Project")
      expect(body.project.userId).toBe(user.id)
    })

    it("should return 401 without authentication", async () => {
      const req = new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", webAppUrl: "https://test.com" }),
      })

      const res = await projectsPOST(req)
      expect(res.status).toBe(401)
    })
  })

  describe("GET /api/projects/:id", () => {
    it("should get a project by id", async () => {
      const user = await createTestUser("get@example.com", "password123", "Get User")
      await loginAsUser(user.id, user.email)

      const project = await prismaTest.project.create({
        data: {
          name: "Get Project",
          webAppUrl: "https://get.com",
          userId: user.id,
          status: "Active",
        },
      })

      const req = new Request(`http://localhost/api/projects/${project.id}`)
      const res = await projectGET(req, { params: { projectId: project.id } })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.project.name).toBe("Get Project")
    })
  })

  describe("PUT /api/projects/:id", () => {
    it("should update a project", async () => {
      const user = await createTestUser("update@example.com", "password123", "Update User")
      await loginAsUser(user.id, user.email)

      const project = await prismaTest.project.create({
        data: {
          name: "Old Name",
          webAppUrl: "https://old.com",
          userId: user.id,
          status: "Active",
        },
      })

      const req = new Request(`http://localhost/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      })

      const res = await projectPUT(req, { params: { projectId: project.id } })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.project.name).toBe("Updated Name")
    })

    it("should return 404 for another user's project", async () => {
      const owner = await createTestUser("owner@example.com", "password123", "Owner")
      const other = await createTestUser("other@example.com", "password123", "Other")
      await loginAsUser(other.id, other.email)

      const project = await prismaTest.project.create({
        data: {
          name: "Private Project",
          webAppUrl: "https://private.com",
          userId: owner.id,
          status: "Active",
        },
      })

      const req = new Request(`http://localhost/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacked" }),
      })

      const res = await projectPUT(req, { params: { projectId: project.id } })
      expect(res.status).toBe(404)

      const body = await res.json()
      expect(body.error).toContain("Project not found")
    })
  })

  describe("DELETE /api/projects/:id", () => {
    it("should delete a project", async () => {
      const user = await createTestUser("delete@example.com", "password123", "Delete User")
      await loginAsUser(user.id, user.email)

      const project = await prismaTest.project.create({
        data: {
          name: "To Delete",
          webAppUrl: "https://delete.com",
          userId: user.id,
          status: "Active",
        },
      })

      const req = new Request(`http://localhost/api/projects/${project.id}`)
      const res = await projectDELETE(req, { params: { projectId: project.id } })
      expect(res.status).toBe(200)

      const deleted = await prismaTest.project.findUnique({ where: { id: project.id } })
      expect(deleted).toBeNull()
    })

    it("should return 404 for another user's project", async () => {
      const owner = await createTestUser("owner2@example.com", "password123", "Owner")
      const other = await createTestUser("other2@example.com", "password123", "Other")
      await loginAsUser(other.id, other.email)

      const project = await prismaTest.project.create({
        data: {
          name: "Private Project 2",
          webAppUrl: "https://private2.com",
          userId: owner.id,
          status: "Active",
        },
      })

      const req = new Request(`http://localhost/api/projects/${project.id}`)
      const res = await projectDELETE(req, { params: { projectId: project.id } })
      expect(res.status).toBe(404)

      const body = await res.json()
      expect(body.error).toContain("Project not found")
    })
  })
})
