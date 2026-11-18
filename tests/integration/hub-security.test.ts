import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

// Never launch Playwright in tests: record what would have been queued.
const started: { scriptId: string; meta: any }[] = []
vi.mock("@/lib/hub-runner", async (orig) => {
  const real = await orig<typeof import("@/lib/hub-runner")>()
  const fake = async (script: any, browser: string, _d: any, _t: any, _a: any, batchId: string | null = null, meta: any = {}) => {
    started.push({ scriptId: script.id, meta })
    const e = await prismaTest.testExecution.create({
      data: {
        scriptId: script.id,
        status: "Queued",
        logOutput: "",
        browser,
        batchId,
        projectId: meta.projectId ?? script.projectId ?? null,
        triggerSource: meta.triggerSource ?? "manual",
      },
    })
    return e.id
  }
  return {
    ...real,
    startScriptRun: vi.fn(fake),
    startBatchRun: vi.fn(async (scripts: any[], opts: any) => {
      const ids: string[] = []
      for (const s of scripts) ids.push(await fake(s, opts.browser, false, undefined, false, opts.batchId, opts.meta))
      return ids
    }),
  }
})

import { NextRequest } from "next/server"
import { POST as createScript } from "@/app/api/hub/scripts/route"
import { PUT as editScript } from "@/app/api/hub/scripts/[scriptId]/route"
import { POST as runScript } from "@/app/api/hub/scripts/[scriptId]/run/route"
import { GET as getExecution } from "@/app/api/hub/executions/[executionId]/route"
import { POST as cancelExecution } from "@/app/api/hub/executions/[executionId]/cancel/route"
import { POST as revealSecret } from "@/app/api/hub/config/env/[id]/reveal/route"
import { GET as listEnv } from "@/app/api/hub/config/env/route"
import { POST as ciRun } from "@/app/api/hub/ci/run/route"
import { GET as ciStatus } from "@/app/api/hub/ci/status/route"
import { GET as compare } from "@/app/api/hub/compare/route"
import { GET as listBaselines, POST as createBaseline } from "@/app/api/hub/visual/baselines/route"
import { DELETE as deleteBaseline } from "@/app/api/hub/visual/baselines/[id]/route"
import { GET as listComparisons, POST as runComparison } from "@/app/api/hub/visual/comparisons/route"
import { PUT as actOnComparison } from "@/app/api/hub/visual/comparisons/[id]/route"
import { GET as visualImage } from "@/app/api/hub/visual/image/route"
import { PNG } from "pngjs"
import { cleanRunEnv } from "@/lib/hub-access"
import { newToken } from "@/lib/hub-ci"
import { nextRunAfter, runDueSchedules } from "@/lib/hub-schedule"
import { recalcTestCaseRollup } from "@/lib/test-cases/rollup"
import { encryptSecret } from "@/lib/crypto"

const req = (body?: unknown, headers: Record<string, string> = {}, url = "http://localhost/x") =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any
const as = (u: { id: string; email: string; name?: string | null }) => {
  sessionUser = { id: u.id, email: u.email, name: u.name ?? u.email }
}

async function seed() {
  const owner = await createTestUser("owner@x.test", "password123", "Owner")
  const viewer = await createTestUser("viewer@x.test", "password123", "Viewer")
  const stranger = await createTestUser("stranger@x.test", "password123", "Stranger")
  const project = await prismaTest.project.create({
    data: {
      name: "Shop",
      webAppUrl: "https://shop.test",
      userId: owner.id,
      projectMembers: { create: { userId: viewer.id, role: "Viewer" } },
    },
  })
  const strangerProject = await prismaTest.project.create({
    data: { name: "Mine", webAppUrl: "https://x.test", userId: stranger.id },
  })
  const script = await prismaTest.testScript.create({
    data: { name: "checkout", type: "Web", code: "test('a', async () => {})", projectId: project.id },
  })
  const shared = await prismaTest.testScript.create({
    data: { name: "example", type: "Web", code: "test('b', async () => {})", projectId: null },
  })
  return { owner, viewer, stranger, project, strangerProject, script, shared }
}

describe("Automation Hub — who can write and run code", () => {
  beforeEach(async () => {
    await resetDatabase()
    started.length = 0
    sessionUser = null
  })

  it("a signed-in stranger can't create a shared script or run another project's test", async () => {
    const { stranger, script } = await seed()
    as(stranger)
    expect((await createScript(req({ name: "evil", type: "Web", code: "x" }))).status).toBe(403)
    expect((await runScript(req({}), { params: { scriptId: script.id } })).status).toBe(404)
    expect((await editScript(req({ code: "evil" }), { params: { scriptId: script.id } })).status).toBe(404)
    expect(started).toHaveLength(0)
  })

  it("a Viewer can read but not run", async () => {
    const { viewer, script } = await seed()
    as(viewer)
    expect((await runScript(req({}), { params: { scriptId: script.id } })).status).toBe(403)
    expect(started).toHaveLength(0)
  })

  it("a shared example runs only inside a project the caller can write to, and the run belongs to it", async () => {
    const { owner, stranger, project, shared } = await seed()
    as(owner)
    expect((await runScript(req({}), { params: { scriptId: shared.id } })).status).toBe(400)
    const ok = await runScript(req({ projectId: project.id }), { params: { scriptId: shared.id } })
    expect(ok.status).toBe(202)
    const { executionId } = await ok.json()
    expect((await prismaTest.testExecution.findUniqueOrThrow({ where: { id: executionId } })).projectId).toBe(project.id)

    // That run is invisible to someone outside the project.
    as(stranger)
    expect((await getExecution(req(), { params: { executionId } })).status).toBe(404)
    // ...and they can't run the example in a project that isn't theirs.
    expect((await runScript(req({ projectId: project.id }), { params: { scriptId: shared.id } })).status).toBe(403)
  })

  it("only an admin can edit a shared example", async () => {
    const { owner, shared } = await seed()
    as(owner)
    expect((await editScript(req({ code: "x" }), { params: { scriptId: shared.id } })).status).toBe(403)
    await prismaTest.user.update({ where: { id: owner.id }, data: { role: "Admin" } })
    expect((await editScript(req({ code: "x" }), { params: { scriptId: shared.id } })).status).toBe(200)
  })

  it("test runs never see the server's secrets", () => {
    process.env.DATABASE_URL_FOR_TEST_ONLY = "postgres://secret"
    const env = cleanRunEnv({ BASE_URL: "https://shop.test" })
    expect(env.BASE_URL).toBe("https://shop.test")
    for (const k of ["DATABASE_URL", "NEXTAUTH_SECRET", "APP_ENCRYPTION_KEY", "DATABASE_URL_FOR_TEST_ONLY"]) {
      expect(env[k]).toBeUndefined()
    }
    expect(env.PATH).toBe(process.env.PATH)
  })

  it("cancelling a queued run marks it Cancelled", async () => {
    const { owner, script } = await seed()
    as(owner)
    const e = await prismaTest.testExecution.create({ data: { scriptId: script.id, status: "Queued", logOutput: "", projectId: script.projectId } })
    const res = await cancelExecution(req({}), { params: { executionId: e.id } })
    expect(res.status).toBe(200)
    expect((await prismaTest.testExecution.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("Cancelled")
    expect((await cancelExecution(req({}), { params: { executionId: e.id } })).status).toBe(409)
  })
})

describe("Data & Config secrets", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  it("strangers can't list or reveal a project's secrets; global secrets need an admin", async () => {
    const { owner, stranger, project } = await seed()
    const projSecret = await prismaTest.environmentVariable.create({
      data: { name: "SHOP_PASSWORD", scope: "project", projectId: project.id, isSecret: true, valueEncrypted: encryptSecret("hunter2") as any },
    })
    const globalSecret = await prismaTest.environmentVariable.create({
      data: { name: "GLOBAL_KEY", scope: "global", isSecret: true, valueEncrypted: encryptSecret("g-key") as any },
    })

    as(stranger)
    const names = (await (await listEnv()).json()).variables.map((v: any) => v.name)
    expect(names).not.toContain("SHOP_PASSWORD")
    expect((await revealSecret(req({}), { params: { id: projSecret.id } })).status).toBe(404)
    expect((await revealSecret(req({}), { params: { id: globalSecret.id } })).status).toBe(404)

    as(owner)
    expect((await (await revealSecret(req({}), { params: { id: projSecret.id } })).json()).value).toBe("hunter2")
    expect((await revealSecret(req({}), { params: { id: globalSecret.id } })).status).toBe(404)
  })
})

describe("CI trigger, schedules, compare, test-case link", () => {
  beforeEach(async () => {
    await resetDatabase()
    started.length = 0
    sessionUser = null
  })

  it("a CI token starts runs in its own project and reports status; bad or revoked tokens are refused", async () => {
    const { project, script } = await seed()
    const t = newToken()
    const row = await prismaTest.hubTriggerToken.create({ data: { projectId: project.id, name: "GH", tokenHash: t.hash, prefix: t.prefix } })

    expect((await ciRun(req({}, { Authorization: "Bearer qae_nope" }))).status).toBe(401)
    const res = await ciRun(req({}, { Authorization: `Bearer ${t.token}` }))
    expect(res.status).toBe(202)
    const { ref } = await res.json()
    expect(started[0].meta.triggerSource).toBe("ci")

    const running = await (await ciStatus(req(undefined, { Authorization: `Bearer ${t.token}` }, `http://localhost/x?ref=${ref}`))).json()
    expect(running.state).toBe("running")

    await prismaTest.testExecution.updateMany({
      where: { OR: [{ id: ref }, { batchId: ref }] },
      data: { status: "Failed", results: [{ title: "pays", status: "failed", durationMs: 1, retries: 0, error: { message: "Expected 200\ngot 500" } }] as any },
    })
    const done = await (await ciStatus(req(undefined, { Authorization: `Bearer ${t.token}` }, `http://localhost/x?ref=${ref}`))).json()
    expect(done.state).toBe("failed")
    expect(done.failures[0].error).toBe("Expected 200")

    await prismaTest.hubTriggerToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    expect((await ciRun(req({}, { Authorization: `Bearer ${t.token}` }))).status).toBe(401)
    expect(script).toBeTruthy()
  })

  it("schedules compute the next slot and a due schedule starts exactly once", async () => {
    const { project } = await seed()
    // Weekdays at 02:00 from a Friday 03:00 → Monday 02:00.
    const fri = new Date(2026, 10, 20, 3, 0)
    const next = nextRunAfter({ frequency: "weekdays", timeOfDay: "02:00" }, fri)
    expect([next.getDay(), next.getHours(), next.getMinutes()]).toEqual([1, 2, 0])
    expect(nextRunAfter({ frequency: "hourly", everyHours: 4 }, new Date(2026, 0, 1, 10, 30)).getHours()).toBe(14)

    await prismaTest.hubSchedule.create({
      data: { projectId: project.id, name: "Nightly", scope: {}, frequency: "daily", timeOfDay: "02:00", nextRunAt: new Date(Date.now() - 1000) },
    })
    const [a, b] = await Promise.all([runDueSchedules(), runDueSchedules()])
    expect(a + b).toBe(1)
    expect(started.every((s) => s.meta.triggerSource === "schedule")).toBe(true)
  })

  it("compare reports newly failing and fixed tests", async () => {
    const { owner, project, script } = await seed()
    as(owner)
    const mk = (status: string, results: any[]) =>
      prismaTest.testExecution.create({ data: { scriptId: script.id, status, logOutput: "", projectId: project.id, results } })
    const base = await mk("Failed", [{ title: "a", status: "passed" }, { title: "b", status: "failed" }])
    const head = await mk("Failed", [{ title: "a", status: "failed" }, { title: "b", status: "passed" }])
    const d = await (await compare(new NextRequest(`http://localhost/x?projectId=${project.id}&base=${base.id}&head=${head.id}`))).json()
    expect(d.newlyFailing).toEqual(["checkout › a"])
    expect(d.fixed).toEqual(["checkout › b"])
  })

  it("a linked test case takes its status from the latest hub run", async () => {
    const { project, script } = await seed()
    const tc = await prismaTest.testCase.create({ data: { projectId: project.id, title: "Checkout works" } })
    await prismaTest.hubScriptTestCase.create({ data: { scriptId: script.id, testCaseId: tc.id } })
    await prismaTest.testExecution.create({ data: { scriptId: script.id, status: "Failed", logOutput: "", projectId: project.id, duration: 100 } })
    await recalcTestCaseRollup(tc.id)
    const after = await prismaTest.testCase.findUniqueOrThrow({ where: { id: tc.id } })
    expect(after.lastStatus).toBe("Failed")
    expect(after.lastRunSource).toBe("Automated")
  })
})

describe("Visual Diff is scoped to a project", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  const png = (r: number) => {
    const p = new PNG({ width: 4, height: 4 })
    for (let i = 0; i < p.data.length; i += 4) p.data.set([r, 0, 0, 255], i)
    return "data:image/png;base64," + PNG.sync.write(p).toString("base64")
  }
  const nreq = (url: string, body?: unknown) =>
    new NextRequest(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it("only project members see baselines, images and comparisons; only writers change them", async () => {
    const { owner, viewer, stranger, project, strangerProject } = await seed()

    as(owner)
    const created = await createBaseline(
      nreq("http://localhost/x", { projectId: project.id, testName: "home", source: { type: "upload", dataUrl: png(0) } })
    )
    expect(created.status).toBe(201)
    const { baseline } = await created.json()
    expect(baseline.projectId).toBe(project.id)
    expect(baseline.url).toMatch(/^\/api\/hub\/visual\/image\?kind=baseline/)

    const cmp = await runComparison(nreq("http://localhost/x", { baselineId: baseline.id, current: { type: "upload", dataUrl: png(255) } }))
    expect(cmp.status).toBe(201)
    const { comparison } = await cmp.json()
    expect(comparison.status).toBe("fail")

    try {
      // Stranger: nothing in the project is visible or changeable
      as(stranger)
      expect((await listBaselines(nreq(`http://localhost/x?projectId=${project.id}`))).status).toBe(404)
      const own = await (await listBaselines(nreq(`http://localhost/x?projectId=${strangerProject.id}`))).json()
      expect(own.baselines).toHaveLength(0)
      expect((await visualImage(nreq(`http://localhost${baseline.url}`))).status).toBe(404)
      expect((await visualImage(nreq(`http://localhost${comparison.diffUrl}`))).status).toBe(404)
      expect((await listComparisons(nreq(`http://localhost/x?baselineId=${baseline.id}`))).status).toBe(404)
      expect((await runComparison(nreq("http://localhost/x", { baselineId: baseline.id, current: { type: "upload", dataUrl: png(1) } }))).status).toBe(404)
      expect((await actOnComparison(nreq("http://localhost/x", { action: "approve" }), { params: { id: comparison.id } })).status).toBe(404)
      expect((await deleteBaseline(nreq("http://localhost/x"), { params: { id: baseline.id } })).status).toBe(404)

      // Viewer: can look, can't change
      as(viewer)
      expect((await listBaselines(nreq(`http://localhost/x?projectId=${project.id}`))).status).toBe(200)
      const img = await visualImage(nreq(`http://localhost${baseline.url}`))
      expect(img.status).toBe(200)
      expect(img.headers.get("content-type")).toBe("image/png")
      expect((await actOnComparison(nreq("http://localhost/x", { action: "approve" }), { params: { id: comparison.id } })).status).toBe(403)
      expect((await createBaseline(nreq("http://localhost/x", { projectId: project.id, testName: "x", source: { type: "upload", dataUrl: png(0) } }))).status).toBe(403)

      // Owner approves: the baseline becomes the new image
      as(owner)
      expect((await actOnComparison(nreq("http://localhost/x", { action: "approve" }), { params: { id: comparison.id } })).status).toBe(200)
    } finally {
      as(owner)
      expect((await deleteBaseline(nreq("http://localhost/x"), { params: { id: baseline.id } })).status).toBe(200)
    }
  })

  it("a baseline can't be seeded from another project's screenshot", async () => {
    const { stranger, project, strangerProject, script } = await seed()
    const run = await prismaTest.testExecution.create({
      data: { scriptId: script.id, status: "Passed", logOutput: "", browser: "chromium", projectId: project.id },
    })
    const ev = await prismaTest.evidenceFile.create({
      data: { testExecutionId: run.id, fileType: "screenshot", filePath: "/etc/hosts", stepNumber: 1, pageUrl: "https://shop.test", elementLocator: "", status: "pass", tags: [] },
    })
    as(stranger)
    const res = await createBaseline(
      nreq("http://localhost/x", { projectId: strangerProject.id, testName: "steal", source: { type: "evidence", evidenceId: ev.id } })
    )
    expect(res.status).toBe(404)
  })
})
