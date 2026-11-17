import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectMember: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }))

import { prisma } from "@/lib/db"
import { canUseProject } from "@/lib/api-guards"

const as = (role: string | null, { creator = false, globalAdmin = false } = {}) => {
  vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "p1", userId: creator ? "u1" : "owner" } as never)
  vi.mocked(prisma.projectMember.findUnique).mockResolvedValue(role ? ({ role } as never) : null)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: globalAdmin ? "Admin" : "User" } as never)
}

describe("canUseProject — manual runs are a team activity, not owner-only", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("lets a project Admin (not the creator) read and record results", async () => {
    as("Admin")
    expect(await canUseProject("p1", "u1", "read")).toBe(true)
    expect(await canUseProject("p1", "u1", "write")).toBe(true)
  })

  it("lets a Member record results", async () => {
    as("Member")
    expect(await canUseProject("p1", "u1", "write")).toBe(true)
  })

  it("lets a Viewer read but not record", async () => {
    as("Viewer")
    expect(await canUseProject("p1", "u1", "read")).toBe(true)
    expect(await canUseProject("p1", "u1", "write")).toBe(false)
  })

  it("keeps outsiders out", async () => {
    as(null)
    expect(await canUseProject("p1", "u1", "read")).toBe(false)
  })

  it("still lets the creator in without a member row", async () => {
    as(null, { creator: true })
    expect(await canUseProject("p1", "u1", "write")).toBe(true)
  })
})

describe("usableProjectIds — bulk test-case actions follow team roles", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("keeps only projects the user may write to", async () => {
    const { usableProjectIds } = await import("@/lib/api-guards")
    vi.mocked(prisma.project.findUnique).mockImplementation((async ({ where }: any) => ({ id: where.id, userId: "owner" })) as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: "User" } as never)
    vi.mocked(prisma.projectMember.findUnique).mockImplementation((async ({ where }: any) => {
      const p = where.userId_projectId.projectId
      return p === "member-of" ? { role: "Member" } : p === "viewer-of" ? { role: "Viewer" } : null
    }) as never)

    const write = await usableProjectIds("u1", ["member-of", "viewer-of", "stranger", "member-of"], "write")
    expect([...write]).toEqual(["member-of"])
    const read = await usableProjectIds("u1", ["member-of", "viewer-of", "stranger"], "read")
    expect([...read].sort()).toEqual(["member-of", "viewer-of"])
  })
})

describe("memberProjectWhere — list queries include projects you're a member of", () => {
  it("matches the creator or any member, not just the creator", async () => {
    const { memberProjectWhere } = await import("@/lib/api-guards")
    expect(memberProjectWhere("u1")).toEqual({
      OR: [{ userId: "u1" }, { projectMembers: { some: { userId: "u1" } } }],
    })
  })
})
