import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

const generator = vi.fn(async (..._a: any[]) => [
  { title: "يقبل رقم هوية صحيح", priority: "High", steps: [{ actionDescription: "أدخل رقم الهوية", expectedResult: "تظهر البيانات" }] },
])
vi.mock("@/lib/ai/test-case-generator", () => ({
  generateTestCasesFromRequirements: (...a: any[]) => generator(...a),
}))

import { POST as sendToBoard } from "@/app/api/brds/[brdId]/board/route"
import { POST as generate } from "@/app/api/brds/[brdId]/requirements/[reqId]/generate/route"
import { POST as linkTests } from "@/app/api/brds/[brdId]/requirements/[reqId]/test-cases/route"
import { GET as listRequirements } from "@/app/api/brds/[brdId]/requirements/route"
import { resyncRequirements } from "@/lib/brd/lifecycle"
import { GET as listJobs } from "@/app/api/ai-jobs/route"
import { POST as markSeen } from "@/app/api/ai-jobs/[jobId]/seen/route"

const json = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const as = (u: { id: string; email: string; name?: string | null }) => {
  sessionUser = { id: u.id, email: u.email, name: u.name ?? u.email }
}

async function seed() {
  const owner = await createTestUser("ba@x.test", "password123", "BA")
  const project = await prismaTest.project.create({ data: { name: "Housing", webAppUrl: "https://h.test", userId: owner.id, boardKey: "HSG" } })
  const brd = await prismaTest.brdDocument.create({
    data: { name: "BRD الإسكان", filename: "brd.docx", fileType: "docx", projectId: project.id, uploaderId: owner.id, uploaderName: "BA" },
  })
  const base = { brdId: brd.id, description: "", sourceVersionNumber: 1, origin: "ai", language: "ar" }
  await prismaTest.brdRequirement.createMany({
    data: [
      { ...base, key: "EPIC-1", title: "إجرائية طلب إسكان طارئ", type: "Epic", orderIndex: 0 },
      {
        ...base,
        key: "US-1.01",
        title: "تقديم طلب إسكان طارئ",
        type: "User story",
        parentKey: "EPIC-1",
        priority: "High",
        description: "بصفتي باحث أرغب في تقديم طلب إسكان طارئ",
        acceptanceCriteria: ["رقم الهوية — حقل رقمي — إلزامي ✓", "<b>no html</b>"],
        sourceQuote: "أرغب في تقديم طلب إسكان طارئ",
        section: "1. الملحمة › 1.01",
        orderIndex: 1,
      },
      { ...base, key: "US-9", title: "قصة بدون ملحمة", type: "User story", orderIndex: 2 },
      { ...base, key: "BR-1", title: "قاعدة عمل", type: "Business rule", orderIndex: 3 },
    ],
  })
  const reqs = await prismaTest.brdRequirement.findMany({ where: { brdId: brd.id } })
  const byKey = Object.fromEntries(reqs.map((r) => [r.key, r]))
  return { owner, project, brd, byKey }
}

const p = (brdId: string, reqId = "") => ({ params: { brdId, reqId } })

describe("BRD → Scrum board", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
  })

  it("creates epics, then every user story under its epic, in the backlog — and never twice", async () => {
    const { owner, project, brd } = await seed()
    as(owner)
    const res = await sendToBoard(json({}), p(brd.id))
    expect(res.status).toBe(201)
    const out = await res.json()
    // Default = epics and stories; the business rule stays a requirement.
    expect(out).toMatchObject({ storiesCreated: 2, epicsCreated: 2 }) // the document's epic + one named after the BRD

    const epics = await prismaTest.scrumEpic.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } })
    expect(epics.map((e) => e.title)).toEqual(["إجرائية طلب إسكان طارئ", "BRD الإسكان"])

    const tasks = await prismaTest.task.findMany({ where: { projectId: project.id }, orderBy: { taskNumber: "asc" } })
    expect(tasks).toHaveLength(2)
    const story = tasks.find((t) => t.title === "تقديم طلب إسكان طارئ")!
    expect(story).toMatchObject({ type: "STORY", status: "TODO", sprintId: null, priority: "HIGH", epicId: epics[0].id, reporterId: owner.id })
    expect(story.description).toContain("معايير القبول")
    expect(story.description).toContain("رقم الهوية — حقل رقمي — إلزامي ✓")
    expect(story.description).toContain("&lt;b&gt;no html&lt;/b&gt;") // document text is escaped
    expect(tasks.find((t) => t.title === "قصة بدون ملحمة")!.epicId).toBe(epics[1].id)
    expect(out.stories.map((s: any) => s.key)).toEqual(["HSG-1", "HSG-2"])

    // The BRD shows the links, and the requirements list shows the story.
    expect(await prismaTest.brdLink.count({ where: { brdId: brd.id } })).toBe(4)
    const list = await (await listRequirements(new Request("http://localhost/x"), p(brd.id))).json()
    expect(list.requirements.find((r: any) => r.key === "US-1.01").story).toMatchObject({ key: "HSG-1" })

    // Again: nothing new.
    const again = await (await sendToBoard(json({}), p(brd.id))).json()
    expect(again).toMatchObject({ storiesCreated: 0, epicsCreated: 0, alreadyOnBoard: 2 })
    expect(await prismaTest.task.count({ where: { projectId: project.id } })).toBe(2)
  })

  it("brings a picked story's epic along, and reuses the BRD epic later", async () => {
    const { owner, project, brd, byKey } = await seed()
    as(owner)
    await sendToBoard(json({ requirementIds: [byKey["US-1.01"].id] }), p(brd.id))
    expect(await prismaTest.scrumEpic.count({ where: { projectId: project.id } })).toBe(1)
    await sendToBoard(json({ requirementIds: [byKey["US-9"].id] }), p(brd.id))
    await sendToBoard(json({ requirementIds: [byKey["BR-1"].id] }), p(brd.id))
    const epics = await prismaTest.scrumEpic.findMany({ where: { projectId: project.id } })
    expect(epics).toHaveLength(2) // the BRD epic was created once and reused
  })

  it("links test cases to the story: existing ones, generated ones and ones linked later", async () => {
    const { owner, project, brd, byKey } = await seed()
    const req = byKey["US-1.01"]
    const earlier = await prismaTest.testCase.create({ data: { projectId: project.id, title: "Earlier" } })
    await prismaTest.brdRequirementTestCase.create({ data: { requirementId: req.id, testCaseId: earlier.id } })

    as(owner)
    const out = await (await sendToBoard(json({ requirementIds: [req.id] }), p(brd.id))).json()
    expect(out.testCasesLinked).toBe(1)
    const taskId = out.stories[0].taskId

    const gen = await (await generate(json({ count: 1 }), p(brd.id, req.id))).json()
    expect(gen.linkedToStory).toBe(true)

    const later = await prismaTest.testCase.create({ data: { projectId: project.id, title: "Later" } })
    await linkTests(json({ add: [later.id] }), p(brd.id, req.id))

    const onStory = await prismaTest.taskTestCase.findMany({ where: { taskId }, include: { testCase: true } })
    expect(onStory.map((l) => l.testCase.title).sort()).toEqual(["Earlier", "Later", "يقبل رقم هوية صحيح"].sort())

    await linkTests(json({ remove: [later.id] }), p(brd.id, req.id))
    expect(await prismaTest.taskTestCase.count({ where: { taskId } })).toBe(2)
  })

  it("notes on the story when a new BRD version changes its requirement", async () => {
    const { owner, brd, byKey } = await seed()
    as(owner)
    const out = await (await sendToBoard(json({ requirementIds: [byKey["US-1.01"].id] }), p(brd.id))).json()
    await resyncRequirements(brd.id, 2, "نص جديد لا يحتوي على المتطلب")
    const acts = await prismaTest.activity.findMany({ where: { taskId: out.stories[0].taskId, action: "BRD changed" } })
    expect(acts).toHaveLength(1)
    expect(acts[0].details).toContain("US-1.01")
  })

  it("needs project access and permission to create stories", async () => {
    const { project, brd } = await seed()
    const stranger = await createTestUser("s@x.test", "password123", "S")
    as(stranger)
    expect((await sendToBoard(json({}), p(brd.id))).status).toBe(404)

    const viewer = await createTestUser("v@x.test", "password123", "V")
    await prismaTest.projectMember.create({
      data: { projectId: project.id, userId: viewer.id, role: "Viewer", canCreateStories: false },
    })
    as(viewer)
    const res = await sendToBoard(json({}), p(brd.id))
    expect(res.status).toBe(403)
    expect(await prismaTest.task.count({ where: { projectId: project.id } })).toBe(0)
  })

  it("generates in the background: the job runs on, then shows its result once", async () => {
    const { owner, project, brd, byKey } = await seed()
    const req = byKey["US-1.01"]
    as(owner)
    const res = await generate(json({ count: 1, background: true }), p(brd.id, req.id))
    expect(res.status).toBe(202)
    const { job } = await res.json()
    expect(job).toMatchObject({ status: "running", kind: "generate-tests", userId: owner.id })
    let jobs: any[] = []
    for (let i = 0; i < 50; i++) {
      jobs = (await (await listJobs()).json()).jobs
      if (jobs[0]?.status !== "running") break
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(jobs[0]).toMatchObject({ status: "done", link: `/projects/${project.id}/brds/${brd.id}?tab=coverage` })
    expect(jobs[0].result.testCases).toHaveLength(1)
    // The user's id reaches the AI call (so it can run on their own computer), with a long time limit.
    expect(generator.mock.calls.at(-1)![2]).toMatchObject({ userId: owner.id, projectId: project.id, timeoutMs: 600_000 })
    expect(await prismaTest.brdRequirementTestCase.count({ where: { requirementId: req.id } })).toBe(1)

    await markSeen(new Request("http://localhost/x", { method: "POST" }), { params: { jobId: job.id } })
    expect((await (await listJobs()).json()).jobs).toHaveLength(0)

    // Someone else can't see it or mark it.
    const other = await createTestUser("o@x.test", "password123", "O")
    as(other)
    expect((await (await listJobs()).json()).jobs).toHaveLength(0)
  })

  it("a failed background generation says why", async () => {
    const { owner, brd, byKey } = await seed()
    generator.mockRejectedValueOnce(new Error("Ollama at the desktop app (this computer) returned 404: model 'x' not found"))
    as(owner)
    await generate(json({ count: 2, background: true }), p(brd.id, byKey["US-9"].id))
    let jobs: any[] = []
    for (let i = 0; i < 50; i++) {
      jobs = (await (await listJobs()).json()).jobs
      if (jobs[0]?.status !== "running") break
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(jobs[0].status).toBe("failed")
    expect(jobs[0].error).toMatch(/model 'x' not found/)
  })
})
