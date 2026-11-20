import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

// The AI and the page reader.
const chat = vi.fn()
vi.mock("@/lib/ai/provider-chat", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/provider-chat")>()),
  chatWithConfiguredProvider: (o: any) => chat(o),
  hasConfiguredProvider: async () => true,
}))
vi.mock("@/lib/plain-english/page-outline", () => ({ fetchPageOutline: vi.fn(async () => "button: Sign in\nfield: Email") }))

import { automateTestCase } from "@/lib/hub-automate"
import { POST as automate } from "@/app/api/projects/[projectId]/test-cases/[tcId]/automate/route"

async function seed() {
  const tester = await createTestUser("tester@x.test", "password123", "Tester")
  const project = await prismaTest.project.create({ data: { name: "Shop", webAppUrl: "https://shop.test", userId: tester.id } })
  sessionUser = { id: tester.id, email: tester.email, name: "Tester" }
  return { tester, project }
}

const steps = (rows: [string, string?][]) => ({ create: rows.map(([a, e], i) => ({ stepNumber: i + 1, actionDescription: a, expectedResult: e ?? "" })) })

describe("Automate a manual test case", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
    chat.mockReset()
  })

  it("uses plain-English steps as they are — no AI — and links the test to the case", async () => {
    const { tester, project } = await seed()
    const tc = await prismaTest.testCase.create({
      data: { projectId: project.id, title: "Sign in works", steps: steps([['Go to "https://shop.test/login"'], ['Click "Sign in"', "Dashboard opens"]]) },
    })
    const r = await automateTestCase({ projectId: project.id, testCaseId: tc.id, userId: tester.id })
    expect(r).toMatchObject({ name: "Sign in works", usedAi: false, unclear: 0, stepCount: 2 })
    expect(chat).not.toHaveBeenCalled()
    const script = await prismaTest.testScript.findUniqueOrThrow({ where: { id: r.scriptId }, include: { testCaseLinks: true } })
    expect(script).toMatchObject({ mode: "steps", folder: "From test cases", projectId: project.id })
    expect(script.steps).toEqual([{ text: 'Go to "https://shop.test/login"' }, { text: 'Click "Sign in"', expected: "Dashboard opens" }])
    expect(script.testCaseLinks.map((l) => l.testCaseId)).toEqual([tc.id])
    expect(script.code).toContain('qa.step(page, "Click \\"Sign in\\"")')
  })

  it("asks AI for manual wording, checks every sentence, starts on the project's site; Arabic titles keep their name", async () => {
    const { tester, project } = await seed()
    chat.mockResolvedValue(JSON.stringify({ steps: ['Type "a@b.co" in the "Email" field', 'Click "Sign in"', "Then magic happens", 'Verify that the page contains "مرحبا"'] }))
    const tc = await prismaTest.testCase.create({
      data: { projectId: project.id, title: "تسجيل الدخول", steps: steps([["Enter your email and press sign in", "A welcome message appears"]]) },
    })
    const r = await automateTestCase({ projectId: project.id, testCaseId: tc.id, userId: tester.id })
    expect(r).toMatchObject({ name: "تسجيل الدخول", usedAi: true, unclear: 1 })
    const prompt = chat.mock.calls[0][0].prompt as string
    expect(prompt).toContain("Enter your email and press sign in")
    expect(prompt).toContain("Expected: A welcome message appears")
    expect(prompt).toContain("Verify step")
    expect(prompt).toContain("button: Sign in") // read the real page
    const script = await prismaTest.testScript.findUniqueOrThrow({ where: { id: r.scriptId } })
    expect((script.steps as any[])[0]).toEqual({ text: 'Go to "https://shop.test"' })
    expect((script.steps as any[]).map((s) => s.text)).toContain("Then magic happens") // kept for the tester to fix
  })

  it("the button: a background job; an automated case opens its test instead of a duplicate; outsiders get nothing", async () => {
    const { project } = await seed()
    const tc = await prismaTest.testCase.create({ data: { projectId: project.id, title: "Search", steps: steps([['Click "Search"']]) } })
    const p = { params: { projectId: project.id, tcId: tc.id } }
    const post = (body: unknown = {}) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) })

    const res = await automate(post(), p)
    expect(res.status).toBe(202)
    for (let i = 0; i < 50 && (await prismaTest.aiJob.findFirst({ where: { status: "running" } })); i++) await new Promise((r) => setTimeout(r, 20))
    const job = await prismaTest.aiJob.findFirstOrThrow()
    expect(job).toMatchObject({ status: "done", kind: "automate-test-case" })
    expect(job.link).toBe(`/projects/${project.id}/automation-hub?tab=tests&test=Search`)

    const again = await (await automate(post(), p)).json()
    expect(again.existing).toMatchObject({ name: "Search" })
    expect(await prismaTest.testScript.count()).toBe(1)

    const stranger = await createTestUser("s@x.test", "password123", "S")
    sessionUser = { id: stranger.id, email: stranger.email, name: "S" }
    expect((await automate(post(), p)).status).toBe(404)
  })
})
