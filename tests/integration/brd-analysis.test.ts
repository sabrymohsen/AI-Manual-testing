import { describe, it, expect, beforeEach, vi } from "vitest"
import { prismaTest, resetDatabase, createTestUser } from "./setup"

vi.mock("@/lib/db", () => ({ prisma: prismaTest }))

let sessionUser: { id: string; name: string; email: string } | null = null
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)),
}))

// The AI: one real story (quote is in the document) and one it made up.
const chat = vi.fn()
let provider: any = { provider: "Kimi", apiKey: "k", model: "kimi-k2" }
vi.mock("@/lib/ai/provider-chat", () => ({
  chatWithConfiguredProvider: (opts: any) => chat(opts),
  resolveProvider: async () => provider,
  localAiProvider: async () => null,
}))

import { GET as getAnalysis, POST as startAnalysis } from "@/app/api/brds/[brdId]/analysis/route"
import { POST as applyAnalysis } from "@/app/api/brds/[brdId]/analysis/[analysisId]/apply/route"

const HTML = `
<h2>1. الملحمة : إجرائية طلب إسكان طارئ</h2>
<h3>1.01 قصة المستخدم: طلب سكن طارئ</h3>
<ul><li>بصفتي باحث بنيابة عن المستفيد</li></ul>
<p>أرغب في تقديم طلب إسكان طارئ حتى يحصل المستفيد على سكن بديل فوري</p>
<ul><li>معايير القبول :</li><li>يقوم النظام بتعبئة بيانات المستفيد تلقائيًا بناء على رقم الهوية</li></ul>
<table><tr><td>الحقل</td><td>إلزامي</td></tr><tr><td>رقم الهوية</td><td><ul><li></li></ul></td></tr></table>
<p>يجب أن يتم الرد على الطلب بشكل سريع.</p>
`

const AI_REPLY = JSON.stringify({
  requirements: [
    { ref: "1", kind: "epic", title: "إجرائية طلب إسكان طارئ", description: "إجرائية طلب إسكان طارئ", sourceQuote: "الملحمة : إجرائية طلب إسكان طارئ", confidence: 0.95 },
    {
      ref: "1.01",
      kind: "user_story",
      title: "تقديم طلب إسكان طارئ",
      description: "بصفتي باحث أرغب في تقديم طلب إسكان طارئ للمستفيد",
      acceptanceCriteria: ["يعبئ النظام بيانات المستفيد تلقائيًا من رقم الهوية", "رقم الهوية — إلزامي ✓"],
      priority: null,
      parentRef: "1",
      sourceQuote: "أرغب في تقديم طلب إسكان طارئ حتى يحصل المستفيد على سكن بديل فوري",
      confidence: 0.9,
    },
    {
      ref: null,
      kind: "functional",
      title: "إرسال بريد إلكتروني عند الاعتماد",
      description: "يرسل النظام بريدًا إلكترونيًا للمستفيد عند اعتماد الطلب",
      sourceQuote: "يرسل النظام بريدًا إلكترونيًا للمستفيد عند اعتماد الطلب",
      confidence: 0.8,
    },
  ],
  issues: [
    { kind: "ambiguity", severity: "medium", text: "مدة الرد غير محددة", quote: "يجب أن يتم الرد على الطلب بشكل سريع", suggestion: "حدد مدة الرد بالساعات" },
  ],
})

const json = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const as = (u: { id: string; email: string; name?: string | null }) => {
  sessionUser = { id: u.id, email: u.email, name: u.name ?? u.email }
}

async function seed() {
  const owner = await createTestUser("ba@x.test", "password123", "BA")
  const viewer = await createTestUser("viewer@x.test", "password123", "Viewer")
  const project = await prismaTest.project.create({
    data: { name: "Housing", webAppUrl: "https://h.test", userId: owner.id, projectMembers: { create: { userId: viewer.id, role: "Viewer" } } },
  })
  const brd = await prismaTest.brdDocument.create({
    data: { name: "BRD", filename: "brd.docx", fileType: "docx", projectId: project.id, uploaderId: owner.id, uploaderName: "BA" },
  })
  const v = await prismaTest.brdVersion.create({
    data: { brdId: brd.id, versionNumber: 1, storagePath: "none", fileType: "docx", fileSize: 1, contentHtml: HTML },
  })
  await prismaTest.brdDocument.update({ where: { id: brd.id }, data: { currentVersionId: v.id } })
  return { owner, viewer, project, brd }
}

const p = (brdId: string, analysisId?: string) => ({ params: { brdId, analysisId: analysisId ?? "" } })

async function waitDone(brdId: string) {
  for (let i = 0; i < 100; i++) {
    const a = (await (await getAnalysis(new Request("http://localhost/x"), p(brdId))).json()).analysis
    if (a && (a.status === "done" || a.status === "failed")) return a
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error("analysis did not finish")
}

describe("BRD AI analysis", () => {
  beforeEach(async () => {
    await resetDatabase()
    sessionUser = null
    provider = { provider: "Kimi", apiKey: "k", model: "kimi-k2" }
    chat.mockReset()
    chat.mockImplementation(async (opts: any) => (opts.json ? AI_REPLY : "ملخص: النظام يدير طلبات الإسكان الطارئ."))
  })

  it("keeps Arabic, verifies quotes against the document and flags the invented requirement", async () => {
    const { owner, brd } = await seed()
    as(owner)
    expect((await startAnalysis(json({}), p(brd.id))).status).toBe(202)
    const a = await waitDone(brd.id)

    expect(a).toMatchObject({ status: "done", method: "ai", language: "ar", provider: "Kimi" })
    const sent = chat.mock.calls.find((c) => c[0].json)![0]
    expect(sent.system).toMatch(/Do NOT translate/)
    expect(sent.prompt).toContain("| رقم الهوية | ✓ |") // the table and its tick reached the model
    expect(sent.command).toBe("analyze-brd")

    const story = a.candidates.find((c: any) => c.kind === "user_story")
    expect(story).toMatchObject({ key: "US-1.01", verified: true, title: "تقديم طلب إسكان طارئ" })
    expect(story.parentKey).toBe(a.candidates.find((c: any) => c.kind === "epic").key)
    const invented = a.candidates.find((c: any) => c.title.includes("بريد"))
    expect(invented.verified).toBe(false)
    expect(invented.confidence).toBeLessThanOrEqual(0.3)
    expect(a.issues[0]).toMatchObject({ kind: "ambiguity", verified: true })
    expect(a.summary).toContain("ملخص")
  })

  it("adds only what was picked, and replaces earlier auto-found rows that have no tests", async () => {
    const { owner, project, brd } = await seed()
    // Earlier junk from a scan, a hand-added one, and a scanned one with a linked test.
    await prismaTest.brdRequirement.createMany({
      data: [
        { brdId: brd.id, key: "REQ-1", title: "الفهرس 2", description: "الفهرس 2", sourceVersionNumber: 1 },
        { brdId: brd.id, key: "REQ-2", title: "Manual one", description: "kept", origin: "manual" },
        { brdId: brd.id, key: "REQ-3", title: "Linked", description: "has a test", sourceVersionNumber: 1 },
      ],
    })
    const linked = await prismaTest.brdRequirement.findFirstOrThrow({ where: { key: "REQ-3" } })
    const tc = await prismaTest.testCase.create({ data: { projectId: project.id, title: "TC" } })
    await prismaTest.brdRequirementTestCase.create({ data: { requirementId: linked.id, testCaseId: tc.id } })

    as(owner)
    await startAnalysis(json({}), p(brd.id))
    const a = await waitDone(brd.id)
    const verified = a.candidates.filter((c: any) => c.verified).map((c: any) => c.id)

    const res = await applyAnalysis(json({ candidateIds: verified, replaceAutoFound: true }), p(brd.id, a.id))
    expect(await res.json()).toMatchObject({ added: 2, removed: 1 })

    const rows = await prismaTest.brdRequirement.findMany({ where: { brdId: brd.id }, orderBy: { orderIndex: "asc" } })
    const keys = rows.map((r) => r.key)
    expect(keys).not.toContain("REQ-1")
    expect(keys).toEqual(expect.arrayContaining(["REQ-2", "REQ-3", "US-1.01"]))
    const story = rows.find((r) => r.key === "US-1.01")!
    expect(story).toMatchObject({ origin: "ai", language: "ar", type: "User story" })
    expect(story.acceptanceCriteria).toEqual(["يعبئ النظام بيانات المستفيد تلقائيًا من رقم الهوية", "رقم الهوية — إلزامي ✓"])
    expect(story.sourceQuote).toContain("أرغب في تقديم طلب إسكان طارئ")
    expect(rows.some((r) => r.title.includes("بريد"))).toBe(false) // the invented one wasn't picked
  })

  it("can create the added epic and story on the Scrum board in the same step", async () => {
    const { owner, project, brd } = await seed()
    as(owner)
    await startAnalysis(json({}), p(brd.id))
    const a = await waitDone(brd.id)
    const verified = a.candidates.filter((c: any) => c.verified).map((c: any) => c.id)
    const out = await (await applyAnalysis(json({ candidateIds: verified, sendToBoard: true }), p(brd.id, a.id))).json()
    expect(out.board).toMatchObject({ storiesCreated: 1, epicsCreated: 1 })
    const task = await prismaTest.task.findFirstOrThrow({ where: { projectId: project.id } })
    const epic = await prismaTest.scrumEpic.findFirstOrThrow({ where: { projectId: project.id } })
    expect(task).toMatchObject({ title: "تقديم طلب إسكان طارئ", type: "STORY", epicId: epic.id })
    expect(epic.title).toBe("إجرائية طلب إسكان طارئ")
  })

  it("falls back to the rule-based scan without an AI provider; outsiders can't see or run it", async () => {
    const { owner, brd } = await seed()
    const stranger = await createTestUser("stranger@x.test", "password123", "Stranger")
    provider = null

    as(stranger)
    expect((await startAnalysis(json({}), p(brd.id))).status).toBe(404)

    as(owner)
    await startAnalysis(json({}), p(brd.id))
    const a = await waitDone(brd.id)
    expect(a.method).toBe("rules")
    expect(a.error).toMatch(/No AI provider/)
    expect(chat).not.toHaveBeenCalled()
    expect(a.candidates.find((c: any) => c.ref === "1.01")).toMatchObject({ kind: "user_story", verified: true })

    as(stranger)
    expect((await getAnalysis(new Request("http://localhost/x"), p(brd.id))).status).toBe(404)
    expect((await applyAnalysis(json({ candidateIds: [a.candidates[0].id] }), p(brd.id, a.id))).status).toBe(404)
  })

  it("adds epics and stories the AI skipped, straight from the document's headings", async () => {
    const { owner, brd } = await seed()
    const onlyStory = JSON.parse(AI_REPLY)
    onlyStory.requirements = onlyStory.requirements.filter((r: any) => r.kind === "user_story")
    chat.mockImplementation(async (opts: any) => (opts.json ? JSON.stringify(onlyStory) : "summary"))
    as(owner)
    await startAnalysis(json({}), p(brd.id))
    const a = await waitDone(brd.id)
    const epic = a.candidates.find((c: any) => c.kind === "epic")
    expect(epic).toMatchObject({ title: "إجرائية طلب إسكان طارئ", verified: true })
    const stories = a.candidates.filter((c: any) => c.kind === "user_story")
    expect(stories).toHaveLength(1) // not duplicated by the structural check
    expect(stories[0].parentKey).toBe(epic.key)
  })

  it("uses the rule-based result when the AI fails on every part", async () => {
    const { owner, brd } = await seed()
    chat.mockRejectedValue(new Error("Ollama at http://localhost:11434 returned 404: model 'x' not found"))
    as(owner)
    await startAnalysis(json({}), p(brd.id))
    const a = await waitDone(brd.id)
    expect(a.status).toBe("done")
    expect(a.method).toBe("rules")
    expect(a.error).toMatch(/AI provider failed/)
    expect(a.candidates.length).toBeGreaterThan(0)
  })
})
