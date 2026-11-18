import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

import {
  applyCaseEdit,
  changedFields,
  deleteCasesSafely,
  duplicateCase,
  readSnapshot,
} from "@/lib/test-cases/authoring"
import { buildCaseWhere, parseCaseFilters } from "@/lib/test-cases/filters"

const user = { id: "u1", name: "Tess Tester", email: "tess@example.com" }

async function seed() {
  const owner = await createTestUser("owner@example.com", "password123", "Owner")
  const project = await prismaTest.project.create({
    data: { name: "Shop", webAppUrl: "https://shop.test", userId: owner.id },
  })
  const tc = await prismaTest.testCase.create({
    data: {
      projectId: project.id,
      title: "Checkout with promo code",
      tags: ["smoke"],
      steps: {
        create: [
          { stepNumber: 1, actionDescription: "Add item", expectedResult: "Cart has 1 item" },
          { stepNumber: 2, actionDescription: "Apply PROMO10", expectedResult: "10% off" },
        ],
      },
    },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  })
  return { project, tc }
}

describe("test library — authoring", () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it("keeps step ids when steps are edited, so past results stay linked", async () => {
    const { tc } = await seed()
    const [s1, s2] = tc.steps

    const run = await prismaTest.testRun.create({
      data: { projectId: tc.projectId, testCaseId: tc.id, browserType: "Chromium", viewport: "Desktop", status: "Failed" },
    })
    await prismaTest.testStepResult.create({
      data: { testRunId: run.id, testStepId: s2.id, stepNumber: 2, actionDescription: "Apply PROMO10", expectedResult: "10% off", status: "Failed" },
    })

    await applyCaseEdit(
      tc.id,
      {
        steps: [
          { id: s1.id, actionDescription: "Add item", expectedResult: "Cart has 1 item" },
          { id: s2.id, actionDescription: "Apply code PROMO10", expectedResult: "10% off total" },
          { actionDescription: "Pay", expectedResult: "Order placed" },
        ],
      },
      user
    )

    const steps = await prismaTest.testStep.findMany({ where: { testCaseId: tc.id }, orderBy: { stepNumber: "asc" } })
    expect(steps.map((s) => s.id).slice(0, 2)).toEqual([s1.id, s2.id])
    expect(steps[1].actionDescription).toBe("Apply code PROMO10")
    expect(steps).toHaveLength(3)

    const result = await prismaTest.testStepResult.findFirstOrThrow({ where: { testRunId: run.id } })
    expect(result.testStepId).toBe(s2.id)
  })

  it("removes only the steps the user deleted", async () => {
    const { tc } = await seed()
    await applyCaseEdit(tc.id, { steps: [{ id: tc.steps[1].id, actionDescription: "Apply PROMO10", expectedResult: "10% off" }] }, user)
    const steps = await prismaTest.testStep.findMany({ where: { testCaseId: tc.id } })
    expect(steps.map((s) => s.id)).toEqual([tc.steps[1].id])
    expect(steps[0].stepNumber).toBe(1)
  })

  it("records a version before each real edit and skips no-op saves", async () => {
    const { tc } = await seed()

    await applyCaseEdit(tc.id, { title: "Checkout with promo code" }, user)
    expect(await prismaTest.testCaseVersion.count({ where: { testCaseId: tc.id } })).toBe(0)

    await applyCaseEdit(tc.id, { title: "Guest checkout with promo code", priority: "High" }, user)
    const versions = await prismaTest.testCaseVersion.findMany({ where: { testCaseId: tc.id } })
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe(1)
    expect(versions[0].summary).toBe("title, priority")
    expect(versions[0].changedByName).toBe("Tess Tester")
    expect((versions[0].snapshot as any).title).toBe("Checkout with promo code")
  })

  it("restoring a version brings back the old content", async () => {
    const { tc } = await seed()
    const before = (await prismaTest.$transaction((tx) => readSnapshot(tx, tc.id)))!
    await applyCaseEdit(tc.id, { title: "Changed", steps: [] }, user)
    await applyCaseEdit(tc.id, before, user, "Restored v1")

    const now = await prismaTest.testCase.findUniqueOrThrow({ where: { id: tc.id }, include: { steps: true } })
    expect(now.title).toBe("Checkout with promo code")
    expect(now.steps).toHaveLength(2)
    const latest = await prismaTest.testCaseVersion.findFirstOrThrow({ where: { testCaseId: tc.id }, orderBy: { version: "desc" } })
    expect(latest.summary).toMatch(/^Restored v1: /)
  })

  it("changedFields ignores tag order and empty-vs-null", () => {
    const base = {
      title: "t", priority: "Medium", preconditions: null, executionType: "Manual", reviewState: "Ready",
      estimatedMinutes: null, tags: ["a", "b"], assignee: null, suiteId: null, requirementIds: [], steps: [],
    }
    expect(changedFields(base, { tags: ["b", "a"], preconditions: "", assignee: "" })).toEqual([])
    expect(changedFields(base, { estimatedMinutes: 5 })).toEqual(["estimate"])
  })

  it("duplicates a case as a Draft with its steps and tags", async () => {
    const { project, tc } = await seed()
    const copy = await duplicateCase(project.id, tc.id)
    const full = await prismaTest.testCase.findUniqueOrThrow({ where: { id: copy!.id }, include: { steps: true } })
    expect(full.title).toBe("Copy of Checkout with promo code")
    expect(full.reviewState).toBe("Draft")
    expect(full.tags).toEqual(["smoke"])
    expect(full.steps).toHaveLength(2)
    expect(full.steps.every((s) => !tc.steps.some((o) => o.id === s.id))).toBe(true)
  })

  it("deleting a case keeps its bugs and automated run history", async () => {
    const { project, tc } = await seed()
    const run = await prismaTest.testRun.create({
      data: { projectId: project.id, testCaseId: tc.id, browserType: "Chromium", viewport: "Desktop", status: "Failed" },
    })
    const bug = await prismaTest.bugReport.create({
      data: { projectId: project.id, title: "Promo not applied", severity: "High", priority: "High", stepsToReproduce: "1. Apply PROMO10", expectedResult: "10% off", actualResult: "Full price", testCaseId: tc.id, testRunId: run.id },
    })

    const res = await deleteCasesSafely(project.id, [tc.id])
    expect(res.count).toBe(1)

    expect(await prismaTest.testCase.findUnique({ where: { id: tc.id } })).toBeNull()
    const keptBug = await prismaTest.bugReport.findUniqueOrThrow({ where: { id: bug.id } })
    expect(keptBug.testCaseId).toBeNull()
    expect(keptBug.testRunId).toBe(run.id)
    const keptRun = await prismaTest.testRun.findUniqueOrThrow({ where: { id: run.id } })
    expect(keptRun.testCaseId).toBeNull()
  })

  it("will not delete a case from another project", async () => {
    const { tc } = await seed()
    const res = await deleteCasesSafely("some-other-project", [tc.id])
    expect(res.count).toBe(0)
    expect(await prismaTest.testCase.findUnique({ where: { id: tc.id } })).not.toBeNull()
  })
})

describe("test library — filters", () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it("a parent suite includes its sub-suites; assignee 'me' matches by email", async () => {
    const { project, tc } = await seed()
    const parent = await prismaTest.testSuite.create({ data: { projectId: project.id, name: "Checkout" } })
    const child = await prismaTest.testSuite.create({ data: { projectId: project.id, name: "Promo", parentId: parent.id } })
    const me = await prismaTest.projectTeamMember.create({
      data: { projectId: project.id, name: "Tess Tester", email: "TESS@example.com", source: "manual" },
    })
    await prismaTest.testCase.update({ where: { id: tc.id }, data: { suiteId: child.id, assignee: me.id } })
    await prismaTest.testCase.create({ data: { projectId: project.id, title: "Other" } })

    const count = async (qs: string) =>
      prismaTest.testCase.count({
        where: await buildCaseWhere(project.id, parseCaseFilters(new URLSearchParams(qs)), { user }),
      })

    expect(await count(`suite=${parent.id}`)).toBe(1)
    expect(await count("assignee=me")).toBe(1)
    expect(await count("assignee=unassigned")).toBe(1)
    expect(await count("tag=smoke")).toBe(1)
    expect(await count("review=Draft")).toBe(0)
    expect(await count("q=smoke")).toBe(1)
  })

  it("'me' with no matching team member matches nothing", async () => {
    const { project } = await seed()
    const where = await buildCaseWhere(project.id, parseCaseFilters(new URLSearchParams("assignee=me")), {
      user: { email: "nobody@example.com", name: "Nobody" },
    })
    expect(await prismaTest.testCase.count({ where })).toBe(0)
  })
})
