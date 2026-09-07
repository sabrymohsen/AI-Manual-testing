import { describe, it, expect, vi, beforeEach } from "vitest"

const chat = vi.fn()
const resolve = vi.fn()

vi.mock("axios", () => ({ default: { post: vi.fn(async () => { throw new Error("no ollama") }), get: vi.fn() } }))
vi.mock("@/lib/ai/test-case-generator", () => ({ getOllamaModels: vi.fn(async () => []) }))
vi.mock("@/lib/ai/provider-chat", () => ({
  chatWithConfiguredProvider: (...args: any[]) => chat(...args),
  hasConfiguredProvider: vi.fn(async () => false),
  resolveProvider: (...args: any[]) => resolve(...args),
}))

import { generateBugReportDraft } from "@/lib/ai/generate-bug-report"

const input = { description: "The checkout button does nothing on mobile", projectId: "p1" }

describe("why a bug draft fell back to the template", () => {
  beforeEach(() => {
    chat.mockReset()
    resolve.mockReset()
  })

  it("says nothing is configured only when nothing is configured", async () => {
    resolve.mockResolvedValue(null)
    const d = await generateBugReportDraft(input as any)
    expect(d.provider).toBe("rule-based")
    expect(d.fallbackReason).toBe("no AI provider is configured")
    expect(chat).not.toHaveBeenCalled()
  })

  it("names the provider and its error when a configured provider fails", async () => {
    resolve.mockResolvedValue({ provider: "Kimi", apiKey: "k", model: "kimi-k2" })
    chat.mockRejectedValue(new Error("Kimi API error 401: invalid api key"))

    const d = await generateBugReportDraft(input as any)
    expect(d.provider).toBe("rule-based")
    // The old banner blamed configuration for this, sending people to re-enter
    // a key that was never the problem.
    expect(d.fallbackReason).toContain("Kimi")
    expect(d.fallbackReason).toContain("401")
    expect(d.fallbackReason).not.toContain("no AI provider is configured")
  })

  it("distinguishes a provider that answered with prose from one that failed", async () => {
    resolve.mockResolvedValue({ provider: "OpenAI", apiKey: "k", model: "gpt-4o-mini" })
    chat.mockResolvedValue("Sure! Here is your bug report, written out in plain English.")

    const d = await generateBugReportDraft(input as any)
    expect(d.fallbackReason).toContain("not JSON")
    expect(d.fallbackReason).toContain("gpt-4o-mini")
  })

  it("forwards the screenshot's real media type to the provider", async () => {
    resolve.mockResolvedValue({ provider: "Anthropic", apiKey: "k", model: "claude-3-5-sonnet-latest" })
    chat.mockResolvedValue(JSON.stringify({
      title: "Checkout button is inert on mobile",
      description: "Tapping checkout does nothing.",
      severity: "High",
      priority: "High",
      steps: [{ stepNumber: 1, actionDescription: "Tap checkout", expectedResult: "Order is placed" }],
      expectedResult: "Order is placed",
      actualResult: "Nothing happens",
    }))

    const d = await generateBugReportDraft({
      ...input,
      imageBase64: "aGk=",
      imageMimeType: "image/jpeg",
    } as any)

    expect(d.provider).toBe("provider")
    // A JPEG sent up labelled image/png is a 400, and the tester saw only a
    // template with no explanation.
    expect(chat.mock.calls[0][0].imageMediaType).toBe("image/jpeg")
  })

  it("carries no reason at all on a real AI draft", async () => {
    resolve.mockResolvedValue({ provider: "OpenAI", apiKey: "k", model: "gpt-4o-mini" })
    chat.mockResolvedValue(JSON.stringify({ title: "T", description: "D", severity: "Low", priority: "Low", steps: [], expectedResult: "E", actualResult: "A" }))

    const d = await generateBugReportDraft(input as any)
    expect(d.provider).toBe("provider")
    expect(d.fallbackReason).toBeUndefined()
  })
})
