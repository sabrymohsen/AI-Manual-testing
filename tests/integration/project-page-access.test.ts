import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

import { GET as getProject } from "@/app/api/projects/[projectId]/route"
import { GET as getAiConfig, PUT as putAiConfig } from "@/app/api/projects/[projectId]/ai-config/route"
import { POST as testAiConfig } from "@/app/api/projects/[projectId]/ai-config/test/route"
import { resolveProvider } from "@/lib/ai/provider-chat"

const as = (u: { id: string; email: string; name?: string | null }) => {
  sessionUser = { id: u.id, email: u.email, name: u.name ?? u.email }
}
const json = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
const p = (projectId: string) => ({ params: { projectId } })

async function seed() {
  const owner = await createTestUser("owner@x.test", "password123", "Owner")
  const viewer = await createTestUser("viewer@x.test", "password123", "Viewer")
  const admin = await createTestUser("admin@x.test", "password123", "Admin")
  await prismaTest.user.update({ where: { id: admin.id }, data: { role: "Admin" } })
  const stranger = await createTestUser("stranger@x.test", "password123", "Stranger")
  const project = await prismaTest.project.create({
    data: {
      name: "Shop",
      webAppUrl: "https://shop.test",
      userId: owner.id,
      projectMembers: { create: { userId: viewer.id, role: "Viewer" } },
      figmaConfig: { create: { encryptedApiToken: "deadbeef", encryptionIv: "iv", encryptionAuthTag: "tag", fileKey: "F1" } },
    },
  })
  return { owner, viewer, admin, stranger, project }
}

describe("project page access", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  it("a global Admin who isn't a member can open the project (it used to load forever)", async () => {
    const { admin, stranger, project } = await seed()
    as(admin)
    expect((await getProject(new Request("http://localhost/x"), p(project.id))).status).toBe(200)
    expect((await getAiConfig(new Request("http://localhost/x"), p(project.id))).status).toBe(200)

    as(stranger)
    expect((await getProject(new Request("http://localhost/x"), p(project.id))).status).toBe(404)
    // "no access" is a 404 now, not a misleading 401 "not signed in"
    expect((await getAiConfig(new Request("http://localhost/x"), p(project.id))).status).toBe(404)
  })

  it("never sends the encrypted Figma token to the browser", async () => {
    const { viewer, project } = await seed()
    as(viewer)
    const body = await (await getProject(new Request("http://localhost/x"), p(project.id))).json()
    expect(body.project.figmaConfig.hasApiToken).toBe(true)
    expect(body.project.figmaConfig.fileKey).toBe("F1")
    expect(JSON.stringify(body)).not.toContain("deadbeef")
    expect(body.project.figmaConfig.encryptionAuthTag).toBeUndefined()
  })
})

describe("a project's own Ollama address", () => {
  const fetchMock = vi.fn()
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
    fetchMock.mockReset()
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it("is validated, saved, tested and used for AI calls", async () => {
    const { owner, viewer, project } = await seed()

    as(viewer)
    expect((await putAiConfig(json({ provider: "Ollama", baseUrl: "http://box:11434" }), p(project.id))).status).toBe(404)

    as(owner)
    expect((await putAiConfig(json({ provider: "Ollama", baseUrl: "file:///etc/passwd" }), p(project.id))).status).toBe(400)
    const saved = await putAiConfig(json({ provider: "Ollama", baseUrl: "http://gpu-box:11434" }), p(project.id))
    expect(saved.status).toBe(200)
    expect((await saved.json()).config.baseUrl).toBe("http://gpu-box:11434")

    // Test uses the saved address
    const t = await (await testAiConfig(json({ provider: "Ollama" }), p(project.id))).json()
    expect(t.ok).toBe(true)
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("http://gpu-box:11434/api/tags")

    // Real calls use it too, with an installed model when none was picked
    const resolved = await resolveProvider(project.id)
    expect(resolved).toMatchObject({ provider: "Ollama", ollamaUrl: "http://gpu-box:11434", model: "llama3.2" })

    // The panel learns the address and that this is the project's own setting
    const cfg = await (await getAiConfig(new Request("http://localhost/x"), p(project.id))).json()
    expect(cfg.config.baseUrl).toBe("http://gpu-box:11434")
    expect(cfg.effective).toMatchObject({ provider: "Ollama", inherited: false })
  })

  it("falls back to the workspace Ollama address", async () => {
    const { owner, project } = await seed()
    await prismaTest.aiProviderConfig.create({ data: { provider: "Ollama", enabled: true, baseUrl: "http://team-ollama:11434" } })
    as(owner)
    await putAiConfig(json({ provider: "Ollama" }), p(project.id))
    expect(await resolveProvider(project.id)).toMatchObject({ ollamaUrl: "http://team-ollama:11434" })
    const cfg = await (await getAiConfig(new Request("http://localhost/x"), p(project.id))).json()
    expect(cfg.ollamaDefaultUrl).toBe("http://team-ollama:11434")
  })
})
