import { describe, it, expect, beforeEach, vi } from "vitest"

// A user who turned on "AI on this computer", and no workspace provider.
let localAiModel: string | null = "qwen2.5:7b"
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ localAiModel })) },
    aiProviderConfig: { findMany: vi.fn(async () => []) },
    aiUsageEvent: { create: vi.fn(async () => ({})) },
  },
}))
vi.mock("@/lib/ai/project-ai-config", () => ({ getProjectAiCredentials: vi.fn(async () => null) }))

const relay = vi.fn()
vi.mock("@/lib/ai/desktop-relay", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/desktop-relay")>()
  return { ...real, relayToDesktop: (...a: any[]) => relay(...a) }
})

import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"
import { DesktopNotConnectedError } from "@/lib/ai/desktop-relay"

describe("AI on the user's own computer (desktop relay)", () => {
  beforeEach(() => {
    localAiModel = "qwen2.5:7b"
    relay.mockReset()
    for (const k of ["OPENAI_COMPATIBLE_API_KEY", "KIMI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) delete process.env[k]
  })

  it("runs the request on the user's model, with the QA skills for that command", async () => {
    relay.mockResolvedValue({ ok: true, status: 200, data: { message: { content: "Major" }, eval_count: 1 } })
    const out = await chatWithConfiguredProvider({ prompt: "severity?", command: "bug-assistance:suggest-severity", userId: "u1" })
    expect(out).toBe("Major")
    const [userId, path, body] = relay.mock.calls[0]
    expect(userId).toBe("u1")
    expect(path).toBe("/api/chat")
    expect(body.model).toBe("qwen2.5:7b")
    expect(body.messages[0].role).toBe("system")
    expect(body.messages[0].content).toMatch(/QA expertise to apply/)
    expect(body.messages[0].content).toMatch(/Severity and priority/)
  })

  it("falls back to the configured provider path when the desktop app is closed", async () => {
    relay.mockRejectedValue(new DesktopNotConnectedError())
    await expect(chatWithConfiguredProvider({ prompt: "x", userId: "u1" })).rejects.toThrow(/desktop app to be open/)
  })

  it("does nothing different for users who didn't turn it on", async () => {
    localAiModel = null
    await expect(chatWithConfiguredProvider({ prompt: "x", userId: "u1" })).rejects.toThrow(/^No AI provider is configured$/)
    expect(relay).not.toHaveBeenCalled()
  })

  it("reports a real Ollama error from the user's computer instead of hiding it", async () => {
    relay.mockResolvedValue({ ok: false, status: 404, data: { error: "model 'qwen2.5:7b' not found" } })
    await expect(chatWithConfiguredProvider({ prompt: "x", userId: "u1" })).rejects.toThrow(/not found/)
  })
})

import { bestLocalModel } from "@/components/desktop/use-local-ai"

describe("picking the Ollama model found on the user's computer", () => {
  it("prefers a mid-size text model over vision, embedding or huge ones", () => {
    expect(bestLocalModel(["llava:7b", "nomic-embed-text:latest", "qwen3:8b"])).toBe("qwen3:8b")
    expect(bestLocalModel(["llama3.1:70b", "llama3.2:3b"])).toBe("llama3.2:3b")
    expect(bestLocalModel(["phi4-mini:latest"])).toBe("phi4-mini:latest")
    expect(bestLocalModel([])).toBeNull()
  })
})
