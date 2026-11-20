import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))
const notify = vi.fn(async (..._a: any[]) => {})
vi.mock("@/lib/notifications", () => ({ notify: (...a: any[]) => notify(...a) }))

import { notifyScheduledRunDone, cleanEnvironment } from "@/lib/hub-runner"

describe("scheduled runs tell the team once, when the whole batch is done", () => {
  beforeEach(async () => {
    await resetDatabase()
    notify.mockClear()
  })

  it("one notification per batch, to every project member, with the counts and environment", async () => {
    const owner = await createTestUser("o@x.test", "password123", "O")
    const tester = await createTestUser("t@x.test", "password123", "T")
    const project = await prismaTest.project.create({
      data: { name: "Shop", webAppUrl: "https://s.test", userId: owner.id, projectMembers: { create: { userId: tester.id, role: "Member" } } },
    })
    const script = await prismaTest.testScript.create({ data: { name: "A", type: "Web", code: "x", projectId: project.id } })
    const base = { scriptId: script.id, logOutput: "", batchId: "batch-1", projectId: project.id, triggerSource: "schedule", triggeredByName: "Schedule “Nightly”", environment: "Staging" }
    const a = await prismaTest.testExecution.create({ data: { ...base, status: "Passed", results: [{ status: "passed" }, { status: "passed" }] } })
    const b = await prismaTest.testExecution.create({ data: { ...base, status: "Running" } })

    await notifyScheduledRunDone(a.id) // b still running → nothing yet
    expect(notify).not.toHaveBeenCalled()

    await prismaTest.testExecution.update({ where: { id: b.id }, data: { status: "Failed", results: [{ status: "failed" }] } })
    await notifyScheduledRunDone(b.id)
    await notifyScheduledRunDone(a.id) // a late duplicate call → still one
    expect(notify).toHaveBeenCalledTimes(1)
    const sent = notify.mock.calls[0][0] as any[]
    expect(sent.map((n) => n.userId).sort()).toEqual([owner.id, tester.id].sort())
    expect(sent[0]).toMatchObject({ title: "1 test failed in “Nightly” on Staging", body: "2 passed, 1 failed" })
    expect(sent[0].actionUrl).toBe(`/projects/${project.id}/automation-hub?tab=runs&run=${b.id}`)
  })

  it("manual runs don't notify", async () => {
    const owner = await createTestUser("o@x.test", "password123", "O")
    const project = await prismaTest.project.create({ data: { name: "Shop", webAppUrl: "https://s.test", userId: owner.id } })
    const script = await prismaTest.testScript.create({ data: { name: "A", type: "Web", code: "x", projectId: project.id } })
    const e = await prismaTest.testExecution.create({ data: { scriptId: script.id, logOutput: "", status: "Failed", projectId: project.id, triggerSource: "manual" } })
    await notifyScheduledRunDone(e.id)
    expect(notify).not.toHaveBeenCalled()
  })

  it("only known environment names are accepted", () => {
    expect(cleanEnvironment("Staging")).toBe("Staging")
    expect(cleanEnvironment("staging; rm -rf")).toBeNull()
    expect(cleanEnvironment(undefined)).toBeNull()
  })
})
