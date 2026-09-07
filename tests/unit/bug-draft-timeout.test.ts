import { describe, it, expect, vi, beforeEach } from "vitest"

const chat = vi.fn()
const resolve = vi.fn()
const ollamaModels = vi.fn()
const axiosPost = vi.fn()

vi.mock("axios", () => ({ default: { post: (...a: any[]) => axiosPost(...a), get: vi.fn() } }))
vi.mock("@/lib/ai/test-case-generator", () => ({ getOllamaModels: () => ollamaModels() }))
vi.mock("@/lib/ai/provider-chat", () => ({
  chatWithConfiguredProvider: (...a: any[]) => chat(...a),
  hasConfiguredProvider: vi.fn(async () => false),
  resolveProvider: (...a: any[]) => resolve(...a),
}))

import { generateBugReportDraft } from "@/lib/ai/generate-bug-report"

const input = { description: "The checkout button does nothing on mobile", projectId: "p1" }
const OK_JSON = JSON.stringify({
  title: "T", description: "D", severity: "Low", priority: "Low",
  steps: [], expectedResult: "E", actualResult: "A",
})

describe("how long a tester waits for an AI bug draft", () => {
  beforeEach(() => {
    chat.mockReset()
    resolve.mockReset()
    ollamaModels.mockReset()
    axiosPost.mockReset()
    axiosPost.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434"))
  })

  it("asks the provider for a draft on an interactive timeout, not the 120s default", async () => {
    resolve.mockResolvedValue({ provider: "Kimi", apiKey: "k", model: "kimi-k2" })
    chat.mockResolvedValue(OK_JSON)
    ollamaModels.mockResolvedValue([])

    await generateBugReportDraft(input as any)
    expect(chat.mock.calls[0][0].timeoutMs).toBeLessThan(120_000)
  })

  it("lets a deployment widen the timeout for a slow route to its provider", async () => {
    const had = process.env.AI_DRAFT_TIMEOUT_MS
    process.env.AI_DRAFT_TIMEOUT_MS = "150000"
    resolve.mockResolvedValue({ provider: "Kimi", apiKey: "k", model: "kimi-k2" })
    chat.mockResolvedValue(OK_JSON)
    ollamaModels.mockResolvedValue([])

    await generateBugReportDraft(input as any)

    expect(chat.mock.calls[0][0].timeoutMs).toBe(150_000)
    if (had === undefined) delete process.env.AI_DRAFT_TIMEOUT_MS
    else process.env.AI_DRAFT_TIMEOUT_MS = had
  })

  it("bounds the reply, and makes the provider enforce the JSON the prompt asks for", async () => {
    resolve.mockResolvedValue({ provider: "Kimi", apiKey: "k", model: "kimi-k2" })
    chat.mockResolvedValue(OK_JSON)
    ollamaModels.mockResolvedValue([])

    await generateBugReportDraft(input as any)

    const call = chat.mock.calls[0][0]
    expect(call.json).toBe(true)
    // A bug report is not a 4000-token chat answer, and every token is time
    // spent inside the tester's timeout.
    expect(call.maxTokens).toBeLessThanOrEqual(2000)
  })

  describe("when the screenshot is what ran out the clock", () => {
    const withImage = { ...input, imageBase64: "AAAA", imageMimeType: "image/jpeg" }
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    })

    beforeEach(() => {
      resolve.mockResolvedValue({ provider: "Kimi", apiKey: "k", model: "kimi-k2" })
      ollamaModels.mockResolvedValue([])
    })

    it("retries text-only rather than handing back a template", async () => {
      chat.mockRejectedValueOnce(timeout).mockResolvedValueOnce(OK_JSON)

      const d = await generateBugReportDraft(withImage as any)

      expect(d.provider).toBe("provider")
      expect(chat).toHaveBeenCalledTimes(2)
      expect(chat.mock.calls[0][0].imageBase64).toBe("AAAA")
      // The second ask drops the picture — and the prompt must stop claiming
      // one is attached, or the model reports on evidence it cannot see.
      expect(chat.mock.calls[1][0].imageBase64).toBeUndefined()
      expect(chat.mock.calls[1][0].prompt).not.toContain("screenshot of the issue is attached")
    })

    it("tells the tester the draft never saw their screenshot", async () => {
      chat.mockRejectedValueOnce(timeout).mockResolvedValueOnce(OK_JSON)

      const d = await generateBugReportDraft(withImage as any)

      expect(d.degradedReason).toMatch(/screenshot/i)
    })

    it("says nothing about degradation when the picture went through", async () => {
      chat.mockResolvedValue(OK_JSON)

      const d = await generateBugReportDraft(withImage as any)

      expect(d.degradedReason).toBeUndefined()
    })

    it("says both tries failed when the second one does too", async () => {
      chat.mockRejectedValue(timeout)

      const d = await generateBugReportDraft(withImage as any)

      expect(d.provider).toBe("rule-based")
      expect(chat).toHaveBeenCalledTimes(2)
      expect(d.fallbackReason).toContain("with and without the screenshot")
    })

    it("does not retry a failure that dropping the screenshot cannot fix", async () => {
      chat.mockRejectedValue(new Error("Kimi API error 401: invalid api key"))

      const d = await generateBugReportDraft(withImage as any)

      expect(chat).toHaveBeenCalledTimes(1)
      expect(d.fallbackReason).toContain("401")
    })

    it("does not retry when there was no screenshot to drop", async () => {
      chat.mockRejectedValue(timeout)

      await generateBugReportDraft(input as any)

      expect(chat).toHaveBeenCalledTimes(1)
    })
  })

  it("never enters the Ollama call when no daemon answers", async () => {
    resolve.mockResolvedValue(null)
    ollamaModels.mockResolvedValue([]) // deployed box: nothing installed

    const d = await generateBugReportDraft(input as any)

    expect(d.provider).toBe("rule-based")
    // The 180s-timeout POST must never be attempted; the 5s probe already
    // answered the question.
    expect(axiosPost).not.toHaveBeenCalled()
  })

  it("still uses Ollama when the daemon is really there", async () => {
    resolve.mockResolvedValue(null)
    ollamaModels.mockResolvedValue(["llama3.2:latest"])
    axiosPost.mockResolvedValue({
      data: { response: JSON.stringify({ title: "T", description: "D", severity: "Low", priority: "Low", steps: [], expectedResult: "E", actualResult: "A" }) },
    })

    const d = await generateBugReportDraft(input as any)
    expect(d.provider).toBe("ollama")
  })

  it("skips Hugging Face without a token", async () => {
    const had = process.env.HUGGINGFACE_API_TOKEN
    delete process.env.HUGGINGFACE_API_TOKEN
    resolve.mockResolvedValue(null)
    ollamaModels.mockResolvedValue([])

    const d = await generateBugReportDraft(input as any)

    expect(d.provider).toBe("rule-based")
    // No HF POST either — with Ollama and HF both gated, an unconfigured box
    // now answers immediately instead of after ~5 minutes of timeouts.
    expect(axiosPost).not.toHaveBeenCalled()
    if (had) process.env.HUGGINGFACE_API_TOKEN = had
  })
})
