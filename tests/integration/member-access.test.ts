import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

import { POST as fileBug } from "@/app/api/projects/[projectId]/bug-reports/route"
import { GET as liveQaHistory } from "@/app/api/projects/[projectId]/live-qa-history/route"
import { GET as listTestData } from "@/app/api/projects/[projectId]/test-data/route"
import { GET as listCredentials, POST as addCredential } from "@/app/api/projects/[projectId]/credentials/route"
import { DELETE as deleteCredential } from "@/app/api/projects/[projectId]/credentials/[credentialId]/route"

const as = (u: { id: string; email: string; name?: string | null }) => {
  sessionUser = { id: u.id, email: u.email, name: u.name ?? u.email }
}
const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const get = () => new Request("http://localhost/x")

async function seed() {
  const owner = await createTestUser("owner@x.test", "password123", "Owner")
  const member = await createTestUser("tester@x.test", "password123", "Tester")
  const viewer = await createTestUser("viewer@x.test", "password123", "Viewer")
  const stranger = await createTestUser("stranger@x.test", "password123", "Stranger")
  const project = await prismaTest.project.create({
    data: {
      name: "Shop",
      webAppUrl: "https://shop.test",
      userId: owner.id,
      projectMembers: { create: [{ userId: member.id, role: "Member" }, { userId: viewer.id, role: "Viewer" }] },
    },
  })
  const cred = await prismaTest.projectCredential.create({
    data: { projectId: project.id, roleName: "Admin user", username: "admin", encryptedPassword: "x", encryptionIv: "x", encryptionAuthTag: "x" },
  })
  return { owner, member, viewer, stranger, project, cred }
}

describe("what a project member can do (testers aren't locked out)", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  it("a member files bugs and sees the project's QA data", async () => {
    const { member, project } = await seed()
    as(member)
    const p = { params: { projectId: project.id } }
    const res = await fileBug(post({ title: "Coupon not applied", severity: "High" }), p)
    expect(res.status).toBe(201)
    expect(await prismaTest.bugReport.count({ where: { projectId: project.id } })).toBe(1)
    expect((await liveQaHistory(get(), p)).status).toBe(200)
    expect((await listTestData(get(), p)).status).toBe(200)
    const creds = await (await listCredentials(get(), p)).json()
    expect(creds.credentials[0]).toMatchObject({ roleName: "Admin user" })
    expect(creds.credentials[0].encryptedPassword).toBeUndefined() // never sent to the browser
  })

  it("viewers can work too (the app's role rules), but only owners/admins delete or change secrets", async () => {
    const { owner, member, viewer, project, cred } = await seed()
    const p = { params: { projectId: project.id } }
    as(viewer)
    expect((await fileBug(post({ title: "Viewer bug" }), p)).status).toBe(201)

    for (const u of [member, viewer]) {
      as(u)
      expect((await addCredential(post({ roleName: "x", username: "x", password: "x" }), p)).status).not.toBe(201)
      expect((await deleteCredential(get(), { params: { projectId: project.id, credentialId: cred.id } })).status).not.toBe(200)
    }
    expect(await prismaTest.projectCredential.count({ where: { projectId: project.id } })).toBe(1)

    as(owner)
    expect((await deleteCredential(get(), { params: { projectId: project.id, credentialId: cred.id } })).status).toBe(200)
  })

  it("people outside the project still get nothing", async () => {
    const { stranger, project } = await seed()
    as(stranger)
    const p = { params: { projectId: project.id } }
    expect((await fileBug(post({ title: "x" }), p)).status).not.toBe(201)
    expect((await liveQaHistory(get(), p)).status).not.toBe(200)
    expect(await prismaTest.bugReport.count()).toBe(0)
  })
})
