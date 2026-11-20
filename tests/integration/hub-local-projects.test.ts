import { describe, it, expect, beforeEach, vi } from "vitest"
import JSZip from "jszip"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))
const started: string[] = []
vi.mock("@/lib/hub-runner", async (orig) => ({
  ...(await orig<typeof import("@/lib/hub-runner")>()),
  startScriptRun: vi.fn(async (s: any) => (started.push(s.name), "exec-1")),
}))

import { NextRequest } from "next/server"
import { POST as uploadLocalRun } from "@/app/api/hub/local-runs/route"
import { POST as importZip } from "@/app/api/hub/import/route"
import { POST as runScript } from "@/app/api/hub/scripts/[scriptId]/run/route"
import { POST as runBatch } from "@/app/api/hub/runs/route"
import { exportFiles } from "@/lib/hub-export"
import { stepsToPlaywright } from "@/lib/plain-english/to-playwright"

// A Playwright JSON report as the desktop app sends it.
const REPORT = {
  suites: [
    {
      title: "login.spec.ts",
      file: "login.spec.ts",
      specs: [
        { title: "signs in", file: "login.spec.ts", line: 3, tests: [{ projectName: "chromium", status: "expected", results: [{ status: "passed", duration: 900, attachments: [] }] }] },
        {
          title: "rejects a bad password",
          file: "login.spec.ts",
          line: 9,
          tests: [
            {
              projectName: "chromium",
              status: "unexpected",
              results: [{ status: "failed", duration: 1200, error: { message: "Expected 'Invalid'" }, attachments: [{ name: "screenshot", contentType: "image/png", path: "/Users/me/proj/test-results/x.png" }] }],
            },
          ],
        },
      ],
    },
  ],
}

async function seed() {
  const tester = await createTestUser("t@x.test", "password123", "Tess")
  const project = await prismaTest.project.create({ data: { name: "Shop", webAppUrl: "https://s.test", userId: tester.id } })
  sessionUser = { id: tester.id, email: tester.email, name: "Tess" }
  return { project }
}
const json = (body: unknown) => new NextRequest("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("Playwright projects on a tester's computer, import and export", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
    started.length = 0
  })

  it("a run from the desktop app is shared as a run of a local project; the server never runs it", async () => {
    const { project } = await seed()
    const res = await uploadLocalRun(json({ projectId: project.id, name: "shop-e2e", path: "/Users/me/shop-e2e", report: REPORT, log: "2 tests", durationMs: 2100, exitCode: 1 }))
    expect(res.status).toBe(201)
    const out = await res.json()
    expect(out.summary).toMatchObject({ total: 2, passed: 1, failed: 1 })
    const ex = await prismaTest.testExecution.findUniqueOrThrow({ where: { id: out.executionId }, include: { script: true } })
    expect(ex).toMatchObject({ status: "Failed", triggerSource: "local", executionTarget: "Tess's computer" })
    expect(ex.script).toMatchObject({ mode: "local", name: "shop-e2e", folder: "On my computer" })
    expect((ex.results as any[])[1].screenshot).toBeUndefined() // a path on the tester's disk isn't kept

    // Second upload: same project, a new run.
    await uploadLocalRun(json({ projectId: project.id, name: "shop-e2e", report: REPORT, exitCode: 1 }))
    expect(await prismaTest.testScript.count({ where: { mode: "local" } })).toBe(1)
    expect(await prismaTest.testExecution.count()).toBe(2)

    const runRes = await runScript(json({ projectId: project.id }), { params: { scriptId: ex.scriptId } })
    expect(runRes.status).toBe(400)
    await prismaTest.testScript.create({ data: { name: "Server test", type: "Web", code: "x", projectId: project.id } })
    await runBatch(json({ projectId: project.id }))
    expect(started).toEqual(["Server test"])
  })

  it("imports JavaScript specs with their folders; TypeScript and helper-dependent specs are listed as skipped", async () => {
    const { project } = await seed()
    const zip = new JSZip()
    zip.file("my-tests/tests/checkout/pay.spec.js", 'const { test } = require("@playwright/test")\ntest("pays", async () => {})')
    zip.file("my-tests/tests/login.spec.js", 'import { test } from "@playwright/test"\ntest("logs in", async () => {})')
    zip.file("my-tests/tests/admin.spec.ts", "test('x', async () => {})")
    zip.file("my-tests/tests/uses-po.spec.js", 'const { LoginPage } = require("../pages/login")')
    zip.file("my-tests/node_modules/x/a.spec.js", "ignored")
    const fd = new FormData()
    fd.append("projectId", project.id)
    fd.append("file", new Blob([await zip.generateAsync({ type: "arraybuffer" })]), "tests.zip")
    const res = await importZip(new Request("http://localhost/x", { method: "POST", body: fd }))
    expect(res.status).toBe(201)
    const out = await res.json()
    expect(out.imported).toEqual(
      expect.arrayContaining([
        { name: "pay", folder: "checkout" },
        { name: "login", folder: "Imported" },
      ])
    )
    expect(out.imported).toHaveLength(2)
    expect(out.skipped.map((s: any) => s.file.split("/").pop()).sort()).toEqual(["admin.spec.ts", "uses-po.spec.js"])
    expect(await prismaTest.testScript.count({ where: { projectId: project.id, tags: { has: "imported" } } })).toBe(2)
  })

  it("exports a standalone Playwright project: tests in folders, the step runner only where needed", () => {
    const steps = stepsToPlaywright({ name: "Login", steps: ['Click "Sign in"'] }).code
    const files = exportFiles("Shop", [
      { name: "Login", folder: "Smoke", code: steps },
      { name: "API check", folder: "", code: 'const { test } = require("@playwright/test")' },
    ])
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([".env.example", "README.md", "package.json", "playwright.config.js", "tests/API_check.spec.js", "tests/Smoke/Login.spec.js", "tests/Smoke/qa-steps.cjs"])
    expect(JSON.parse(files.find((f) => f.path === "package.json")!.content).devDependencies).toEqual({ "@playwright/test": "1.60.0" })
  })
})
