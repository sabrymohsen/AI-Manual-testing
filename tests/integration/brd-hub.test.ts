import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))
vi.mock("@/lib/notifications", () => ({ notify: vi.fn().mockResolvedValue(undefined) }))

// The signed-in user for route handlers, switched per test.
let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

import { extractBrdRequirements, afterNewVersion, purgeExpiredBrds } from "@/lib/brd/lifecycle"
import { POST as requestReview } from "@/app/api/brds/[brdId]/reviews/route"
import { PATCH as decideReview } from "@/app/api/brds/[brdId]/reviews/[reviewId]/route"

const V1 = `Login requirements

REQ-1: Users sign in with their email address and a password of at least 8 characters.

REQ-2: After five failed attempts the account is locked for fifteen minutes.`

const V2 = `Login requirements

REQ-1: Users sign in with their email address and a password of at least 8 characters.

REQ-2: After three failed attempts the account is locked until a support agent unlocks it.`

async function seed() {
  const owner = await createTestUser("ba@example.com", "password123", "Bea Analyst")
  const tester = await createTestUser("qa@example.com", "password123", "Quinn Tester")
  const project = await prismaTest.project.create({
    data: {
      name: "Bank",
      webAppUrl: "https://bank.test",
      userId: owner.id,
      projectMembers: { create: { userId: tester.id, role: "Member" } },
    },
  })
  const brd = await prismaTest.brdDocument.create({
    data: { name: "Login BRD", filename: "login.docx", fileType: "docx", projectId: project.id, uploaderId: owner.id, uploaderName: "Bea Analyst" },
  })
  const v1 = await prismaTest.brdVersion.create({
    data: { brdId: brd.id, versionNumber: 1, storagePath: "brds/x/v1.docx", fileType: "docx", fileSize: 1, textContent: V1 },
  })
  await prismaTest.brdDocument.update({ where: { id: brd.id }, data: { currentVersionId: v1.id } })
  return { owner, tester, project, brd, v1 }
}

describe("BRD hub — requirements and change detection", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  it("finds requirements once, keeping the document's own ids", async () => {
    const { brd } = await seed()
    const first = await extractBrdRequirements(brd.id)
    expect(first.added).toBe(2)
    const again = await extractBrdRequirements(brd.id)
    expect(again.added).toBe(0)
    const keys = (await prismaTest.brdRequirement.findMany({ where: { brdId: brd.id }, orderBy: { orderIndex: "asc" } })).map((r) => r.key)
    expect(keys).toEqual(["REQ-1", "REQ-2"])
  })

  it("a new version flags only the tests whose requirement changed", async () => {
    const { brd, project, owner } = await seed()
    await extractBrdRequirements(brd.id)
    const [r1, r2] = await prismaTest.brdRequirement.findMany({ where: { brdId: brd.id }, orderBy: { orderIndex: "asc" } })
    const tc1 = await prismaTest.testCase.create({ data: { projectId: project.id, title: "Sign in works" } })
    const tc2 = await prismaTest.testCase.create({ data: { projectId: project.id, title: "Lockout after failures" } })
    await prismaTest.brdRequirementTestCase.createMany({
      data: [
        { requirementId: r1.id, testCaseId: tc1.id },
        { requirementId: r2.id, testCaseId: tc2.id },
      ],
    })

    const v2 = await prismaTest.brdVersion.create({
      data: { brdId: brd.id, versionNumber: 2, storagePath: "brds/x/v2.docx", fileType: "docx", fileSize: 1, textContent: V2 },
    })
    await prismaTest.brdDocument.update({ where: { id: brd.id }, data: { currentVersionId: v2.id } })
    const res = await afterNewVersion(brd.id, v2, { id: owner.id, name: "Bea Analyst", email: owner.email })

    expect(res).toEqual({ changed: 1, flagged: 1 })
    const after = await prismaTest.brdRequirement.findMany({ where: { brdId: brd.id }, orderBy: { orderIndex: "asc" } })
    expect(after.map((r) => r.status)).toEqual(["active", "changed"])
    expect(after[1].changedInVersion).toBe(2)
    const links = await prismaTest.brdRequirementTestCase.findMany({ orderBy: { testCaseId: "asc" } })
    expect(links.find((l) => l.testCaseId === tc1.id)?.needsReview).toBe(false)
    expect(links.find((l) => l.testCaseId === tc2.id)?.needsReview).toBe(true)
    expect(links.find((l) => l.testCaseId === tc2.id)?.reviewReason).toBe("REQ-2 changed in BRD v2")

    // Restoring the old wording brings the requirement back to active.
    const v3 = await prismaTest.brdVersion.create({
      data: { brdId: brd.id, versionNumber: 3, storagePath: "brds/x/v3.docx", fileType: "docx", fileSize: 1, textContent: V1 },
    })
    await afterNewVersion(brd.id, v3, { id: owner.id })
    expect((await prismaTest.brdRequirement.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("active")
  })

  it("purges only BRDs deleted more than 30 days ago", async () => {
    const { brd, project, owner } = await seed()
    const recent = await prismaTest.brdDocument.create({
      data: { name: "Recent", filename: "r.pdf", fileType: "pdf", projectId: project.id, uploaderId: owner.id, uploaderName: "x", isDeleted: true, deletedAt: new Date(Date.now() - 5 * 86_400_000) },
    })
    await prismaTest.brdDocument.update({ where: { id: brd.id }, data: { isDeleted: true, deletedAt: new Date(Date.now() - 31 * 86_400_000) } })
    expect(await purgeExpiredBrds(project.id)).toBe(1)
    expect(await prismaTest.brdDocument.findUnique({ where: { id: brd.id } })).toBeNull()
    expect(await prismaTest.brdDocument.findUnique({ where: { id: recent.id } })).not.toBeNull()
  })
})

describe("BRD hub — review workflow", () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  const json = (body: unknown) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  it("moves Draft → Reviewed only when every reviewer approves; only the reviewer can decide", async () => {
    const { brd, owner, tester } = await seed()
    sessionUser = { id: owner.id, name: "Bea Analyst", email: owner.email }
    const r = await requestReview(json({ reviewerIds: [tester.id, owner.id] }), { params: { brdId: brd.id } })
    expect(r.status).toBe(201)
    const reviews = await prismaTest.brdReview.findMany({ where: { brdId: brd.id } })
    expect(reviews).toHaveLength(2)

    const testerReview = reviews.find((x) => x.reviewerId === tester.id)!
    const ownerReview = reviews.find((x) => x.reviewerId === owner.id)!

    // The owner can't decide the tester's review.
    const notMine = await decideReview(json({ decision: "Approved" }), { params: { brdId: brd.id, reviewId: testerReview.id } })
    expect(notMine.status).toBe(403)

    // Requesting changes needs a reason.
    sessionUser = { id: tester.id, name: "Quinn Tester", email: tester.email }
    const noReason = await decideReview(json({ decision: "ChangesRequested" }), { params: { brdId: brd.id, reviewId: testerReview.id } })
    expect(noReason.status).toBe(400)

    const ok1 = await decideReview(json({ decision: "Approved" }), { params: { brdId: brd.id, reviewId: testerReview.id } })
    expect((await ok1.json()).statusChanged).toBe(false)
    expect((await prismaTest.brdDocument.findUniqueOrThrow({ where: { id: brd.id } })).status).toBe("Draft")

    sessionUser = { id: owner.id, name: "Bea Analyst", email: owner.email }
    const ok2 = await decideReview(json({ decision: "Approved", comment: "LGTM" }), { params: { brdId: brd.id, reviewId: ownerReview.id } })
    expect((await ok2.json()).statusChanged).toBe(true)
    expect((await prismaTest.brdDocument.findUniqueOrThrow({ where: { id: brd.id } })).status).toBe("Reviewed")
  })

  it("a new version supersedes pending reviews", async () => {
    const { brd, owner, tester } = await seed()
    sessionUser = { id: owner.id, name: "Bea Analyst", email: owner.email }
    await requestReview(json({ reviewerIds: [tester.id] }), { params: { brdId: brd.id } })
    const v2 = await prismaTest.brdVersion.create({
      data: { brdId: brd.id, versionNumber: 2, storagePath: "brds/x/v2.docx", fileType: "docx", fileSize: 1, textContent: V2 },
    })
    await prismaTest.brdDocument.update({ where: { id: brd.id }, data: { currentVersionId: v2.id } })
    await afterNewVersion(brd.id, v2, { id: owner.id })
    expect((await prismaTest.brdReview.findFirstOrThrow({ where: { brdId: brd.id } })).decision).toBe("Superseded")
  })
})
