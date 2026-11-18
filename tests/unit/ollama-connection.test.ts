import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import {
  ollamaBaseUrl,
  ollamaUrlError,
  testProviderConnection,
  detectOllamaModels,
  defaultOllamaModel,
} from "@/lib/hub-ai-providers"

const tags = (names: string[]) =>
  new Response(JSON.stringify({ models: names.map((name) => ({ name })) }), { status: 200 })

describe("Ollama address", () => {
  const had = process.env.OLLAMA_URL
  afterEach(() => {
    if (had === undefined) delete process.env.OLLAMA_URL
    else process.env.OLLAMA_URL = had
  })

  it("prefers the saved address, then OLLAMA_URL, then localhost", () => {
    delete process.env.OLLAMA_URL
    expect(ollamaBaseUrl()).toBe("http://localhost:11434")
    process.env.OLLAMA_URL = "http://gpu-box:11434"
    expect(ollamaBaseUrl()).toBe("http://gpu-box:11434")
    expect(ollamaBaseUrl("https://my-tunnel.example.com/")).toBe("https://my-tunnel.example.com")
  })

  it("accepts an address pasted with /v1 or /api on the end", () => {
    expect(ollamaBaseUrl("http://box:11434/v1")).toBe("http://box:11434")
    expect(ollamaBaseUrl("http://box:11434/api/")).toBe("http://box:11434")
  })

  it("rejects addresses that aren't plain http(s) URLs", () => {
    expect(ollamaUrlError("")).toBeNull()
    expect(ollamaUrlError("http://localhost:11434")).toBeNull()
    expect(ollamaUrlError("localhost:11434")).toMatch(/http/)
    expect(ollamaUrlError("file:///etc/passwd")).toMatch(/http/)
    expect(ollamaUrlError("http://user:pw@box:11434")).toMatch(/password/)
  })
})

describe("testing an Ollama connection", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it("checks the address it was given, not a hard-coded localhost", async () => {
    fetchMock.mockResolvedValue(tags(["qwen3:8b", "llama3.2:latest"]))
    const r = await testProviderConnection("Ollama", "", { ollamaUrl: "http://gpu-box:11434" })
    expect(fetchMock.mock.calls[0][0]).toBe("http://gpu-box:11434/api/tags")
    expect(r.ok).toBe(true)
    expect(r.models).toEqual(["qwen3:8b", "llama3.2"])
  })

  it("explains how to install and start Ollama when nothing answers", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    const r = await testProviderConnection("Ollama", "")
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/ollama\.com/)
    expect(r.detail).toMatch(/ollama pull/)
    expect(r.detail).not.toMatch(/^fetch failed$/)
  })

  it("isn't a success when Ollama runs but has no models", async () => {
    fetchMock.mockResolvedValue(tags([]))
    const r = await testProviderConnection("Ollama", "")
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/no models/)
  })

  it("never offers made-up models when Ollama is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    expect(await detectOllamaModels()).toEqual([])
  })

  it("defaults to a model that is actually installed", async () => {
    fetchMock.mockResolvedValue(tags(["mistral:latest", "llama3.2:latest"]))
    expect(await defaultOllamaModel()).toBe("llama3.2")
    fetchMock.mockResolvedValue(tags(["mistral:latest"]))
    expect(await defaultOllamaModel()).toBe("mistral")
  })
})
