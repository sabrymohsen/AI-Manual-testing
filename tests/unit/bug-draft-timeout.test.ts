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
    chat.mockResolvedValue(JSON.stringify({ title: "T", description: "D", severity: "Low", priority: "Low", steps: [], expectedResult: "E", actualResult: "A" }))
    ollamaModels.mockResolvedValue([])

    await generateBugReportDraft(input as any)
    expect(chat.mock.calls[0][0].timeoutMs).toBeLessThanOrEqual(60_000)
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
