import { describe, it, expect, vi, beforeEach } from "vitest"

const chat = vi.fn()
const resolve = vi.fn()
const ollamaModels = vi.fn()

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/hub-ai-providers", () => ({
  probeOllama: async () => {
    const models = (await ollamaModels()) || []
    return { reachable: models.length > 0, models, baseUrl: "http://localhost:11434" }
  },
}))
vi.mock("@/lib/db", () => ({ prisma: { aiProviderConfig: { findUnique: vi.fn(async () => null) } } }))
vi.mock("@/lib/ai/provider-chat", () => ({
  chatWithConfiguredProvider: (...a: any[]) => chat(...a),
  hasConfiguredProvider: vi.fn(async () => false),
  resolveProvider: (...a: any[]) => resolve(...a),
}))

import { generateBugReportDraft, repairTruncatedJson, draftMaxTokens } from "@/lib/ai/generate-bug-report"

/**
 * Production drafted from a template saying Kimi "replied with something that
 * was not JSON". Kimi had replied with JSON — it was cut off at a token ceiling
 * set too low for Arabic and for a model that reasons before it answers.
 */
describe("a provider reply that stopped mid-sentence", () => {
  describe("closing what the model left open", () => {
    it("recovers a draft cut off inside a string value", () => {
      const cut = '{"title": "Checkout fails", "description": "The button does noth'
      expect(JSON.parse(repairTruncatedJson(cut)!)).toEqual({
        title: "Checkout fails",
        description: "The button does noth",
      })
    })

    it("closes nested steps, innermost first", () => {
      const cut = '{"title":"T","steps":[{"stepNumber":1,"actionDescription":"Open the page"'
      const out = JSON.parse(repairTruncatedJson(cut)!)
      expect(out.steps).toEqual([{ stepNumber: 1, actionDescription: "Open the page" }])
    })

    it("drops a key whose value never arrived", () => {
      const cut = '{"title":"T","severity":'
      expect(JSON.parse(repairTruncatedJson(cut)!)).toEqual({ title: "T" })
    })

    it("drops the trailing comma before a field that never came", () => {
      const cut = '{"title":"T","steps":[],'
      expect(JSON.parse(repairTruncatedJson(cut)!)).toEqual({ title: "T", steps: [] })
    })

    it("survives a cut immediately after an escape character", () => {
      const cut = '{"title":"He said \\"go\\"","description":"a\\\\'
      expect(() => JSON.parse(repairTruncatedJson(cut)!)).not.toThrow()
    })

    it("keeps Arabic content intact — the case that actually failed", () => {
      const cut = '{"title": "الحقول الإلزامية لا تحمل علامة النجمة", "description": "في شاشة إضافة وثائق الإ'
      const out = JSON.parse(repairTruncatedJson(cut)!)
      expect(out.title).toBe("الحقول الإلزامية لا تحمل علامة النجمة")
    })

    it("does not pretend prose is a truncated object", () => {
      expect(repairTruncatedJson("Sure! Here is your bug report.")).toBeNull()
    })
  })

  describe("what the tester is told", () => {
    const input = { description: "The checkout button does nothing on mobile", projectId: "p1" }

    beforeEach(() => {
      chat.mockReset()
      resolve.mockReset()
      ollamaModels.mockReset()
      ollamaModels.mockResolvedValue([])
      resolve.mockResolvedValue({ provider: "Kimi", apiKey: "k", model: "kimi-k3" })
    })

    it("salvages the draft instead of falling back to the template", async () => {
      chat.mockResolvedValue('{"title":"Checkout fails","description":"The button does noth')

      const d = await generateBugReportDraft(input as any)

      expect(d.provider).toBe("provider")
      expect(d.title).toBe("Checkout fails")
    })

    it("admits the reply was cut off rather than passing it off as complete", async () => {
      chat.mockResolvedValue('{"title":"Checkout fails","description":"The button does noth')

      const d = await generateBugReportDraft(input as any)

      expect(d.degradedReason).toMatch(/ran out of room/i)
    })

    it("says nothing about truncation when the reply was whole", async () => {
      chat.mockResolvedValue('{"title":"T","description":"D","steps":[]}')

      const d = await generateBugReportDraft(input as any)

      expect(d.degradedReason).toBeUndefined()
    })

    it("still calls genuine prose what it is", async () => {
      chat.mockResolvedValue("Sure! Here is your bug report, in plain English.")

      const d = await generateBugReportDraft(input as any)

      expect(d.provider).toBe("rule-based")
      expect(d.fallbackReason).toMatch(/not JSON/i)
    })
  })

  describe("the ceiling that caused it", () => {
    it("leaves room for Arabic and for a model that reasons before answering", () => {
      // 1500 was measured too low by a real Arabic draft from this app.
      expect(draftMaxTokens()).toBeGreaterThanOrEqual(4000)
    })

    it("is tunable per deployment", () => {
      const had = process.env.AI_DRAFT_MAX_TOKENS
      process.env.AI_DRAFT_MAX_TOKENS = "8000"
      expect(draftMaxTokens()).toBe(8000)
      if (had === undefined) delete process.env.AI_DRAFT_MAX_TOKENS
      else process.env.AI_DRAFT_MAX_TOKENS = had
    })
  })
})
