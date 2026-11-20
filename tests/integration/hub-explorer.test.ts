import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import http from "http"
import type { AddressInfo } from "net"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

// The AI, scripted: it first proposes a button that doesn't exist, recovers
// from the error, finishes the flow, then proposes one true and one false check.
const answers: any[] = []
const prompts: string[] = []
vi.mock("@/lib/ai/provider-chat", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/provider-chat")>()),
  chatWithConfiguredProvider: async (o: any) => {
    prompts.push(o.prompt)
    return JSON.stringify(answers.shift() ?? { done: true })
  },
}))

import { exploreStory } from "@/lib/hub-explorer"

// A tiny app: a login form that greets the user.
const PAGE = `<!doctype html><html><head><title>Shop</title></head><body>
<h1>Sign in</h1>
<label>Email <input id="e"></label><label>Password <input id="p" type="password"></label>
<button onclick="document.body.innerHTML='<h1>Dashboard</h1><p>Welcome back, '+document.getElementById('e').value+'</p>'">Log in</button>
</body></html>`
let server: http.Server
let url = ""

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" })
    res.end(PAGE)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(() => {
  server.close()
})

describe("AI explorer", () => {
  beforeEach(async () => {
    await resetDatabase()
    answers.length = 0
    prompts.length = 0
  })

  it("drives a real browser step by step, recovers from a wrong step, keeps only checks that hold", async () => {
    const tester = await createTestUser("t@x.test", "password123", "T")
    const project = await prismaTest.project.create({ data: { name: "Shop", webAppUrl: url, userId: tester.id } })
    answers.push(
      { done: false, next: 'Type "{email}" in the "Email" field' },
      { done: false, next: 'Type "{password}" in the "Password" field' },
      { done: false, next: 'Click "Sign in now"' }, // not on the page
      { done: false, next: 'Click "Log in"' },
      { done: true },
      { checks: ['Verify that the page contains "Welcome back, sara@test.com"', 'Verify that the page contains "Order history"'] }
    )

    const r = await exploreStory({
      projectId: project.id,
      userId: tester.id,
      story: { title: "Sign in to the shop", text: "As a customer I want to sign in", criteria: ["The dashboard greets me by email"] },
      startUrl: url,
      data: { email: "sara@test.com", password: "secret1" },
    })

    expect(r.steps).toEqual([
      `Go to "${url}"`,
      'Type "{email}" in the "Email" field',
      'Type "{password}" in the "Password" field',
      'Click "Log in"',
      'Verify that the page contains "Welcome back, sara@test.com"',
    ])
    expect(r.log.find((l) => !l.ok)?.step).toBe('Click "Sign in now"')
    expect(r.checksFailed.map((c) => c.step)).toEqual(['Verify that the page contains "Order history"'])
    // The AI saw the real page and the failure it caused.
    expect(prompts[0]).toContain('textbox "Email"')
    expect(prompts[3]).toContain("FAILED")
    expect(prompts[0]).toContain("{email}")
    expect(prompts[0]).not.toContain("secret1") // secret values never go to the AI
    expect(prompts[0]).toContain('{email} = "sara@test.com"')

    const script = await prismaTest.testScript.findUniqueOrThrow({ where: { id: r.scriptId } })
    expect(script).toMatchObject({ mode: "steps", folder: "AI explorer", name: "Sign in to the shop" })
    expect(script.data).toEqual({ columns: ["email", "password"], rows: [["sara@test.com", "secret1"]] })
    expect(script.code).toContain("for (const [i, row] of rows.entries())")
  }, 120_000)
})
