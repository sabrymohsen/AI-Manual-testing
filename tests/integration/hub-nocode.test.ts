import { describe, it, expect, beforeEach, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

import { NextRequest } from "next/server"
import { POST as createScript } from "@/app/api/hub/scripts/route"
import { PUT as updateScript } from "@/app/api/hub/scripts/[scriptId]/route"
import { writeStepsRuntime } from "@/lib/hub-workspace"

const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("Automation Hub — no-code (plain-English) tests", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  async function seed() {
    const tester = await createTestUser("tester@x.test", "password123", "Tester")
    const project = await prismaTest.project.create({ data: { name: "Shop", webAppUrl: "https://shop.test", userId: tester.id } })
    sessionUser = { id: tester.id, email: tester.email, name: "Tester" }
    return { project }
  }

  it("creates a steps test whose code is generated, and regenerates it on every save", async () => {
    const { project } = await seed()
    const res = await createScript(
      req("POST", { projectId: project.id, name: "Login", type: "Web", mode: "steps", steps: [{ text: 'Go to "https://shop.test"' }] })
    )
    expect(res.status).toBe(201)
    const { script } = await res.json()
    expect(script.mode).toBe("steps")
    expect(script.code).toContain('await page.goto("https://shop.test")')

    // Change the steps (and the name): the code follows; code sent alongside is ignored.
    const upd = await updateScript(
      req("PUT", { name: "Login flow", code: "garbage", steps: [{ text: 'Go to "https://shop.test"' }, { text: 'Click "Sign in"', expected: "Signed in" }] }),
      { params: { scriptId: script.id } }
    )
    expect(upd.status).toBe(200)
    const row = await prismaTest.testScript.findUniqueOrThrow({ where: { id: script.id } })
    expect(row.code).toContain('test("Login flow"')
    expect(row.code).toContain('qa.step(page, "Click \\"Sign in\\"")')
    expect(row.code).not.toContain("garbage")
    expect(row.steps).toEqual([{ text: 'Go to "https://shop.test"' }, { text: 'Click "Sign in"', expected: "Signed in" }])
  })

  it("converts to hand-written code one way, keeping the generated code", async () => {
    const { project } = await seed()
    const { script } = await (
      await createScript(req("POST", { projectId: project.id, name: "Search", type: "Web", mode: "steps", steps: [{ text: 'Click "Search"' }] }))
    ).json()
    await updateScript(req("PUT", { mode: "code" }), { params: { scriptId: script.id } })
    const row = await prismaTest.testScript.findUniqueOrThrow({ where: { id: script.id } })
    expect(row).toMatchObject({ mode: "code", steps: null })
    expect(row.code).toContain('qa.step(page, "Click \\"Search\\"")')
    // Now the code is the source.
    await updateScript(req("PUT", { code: "// my code" }), { params: { scriptId: script.id } })
    expect((await prismaTest.testScript.findUniqueOrThrow({ where: { id: script.id } })).code).toBe("// my code")
  })

  it("rejects steps that aren't a list of sentences", async () => {
    const { project } = await seed()
    const res = await createScript(req("POST", { projectId: project.id, name: "Bad", type: "Web", mode: "steps", steps: "click it" }))
    expect(res.status).toBe(400)
  })

  it("puts the step runner next to a test only when it needs it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-steps-"))
    writeStepsRuntime(dir, '// no steps here\nconst { test } = require("@playwright/test")')
    expect(fs.existsSync(path.join(dir, "qa-steps.cjs"))).toBe(false)
    writeStepsRuntime(dir, 'const qa = require("./qa-steps.cjs")')
    expect(fs.readFileSync(path.join(dir, "qa-steps.cjs"), "utf8")).toContain("QA Engine plain-English step runner")
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
