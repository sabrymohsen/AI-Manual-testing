import { describe, it, expect, vi } from "vitest"
import {
  MAX_SKILLS_PER_CALL,
  MAX_SKILL_CHARS,
  QA_SKILLS,
  skillsForCommand,
  withQaSkills,
} from "@/lib/ai/qa-skills"

// Every command label actually sent by a chatWithConfiguredProvider caller.
const COMMANDS = [
  "agent-brain-context",
  "agent-brain-plan",
  "agent-chat",
  "autonomous-generate-tests",
  "autonomous-run-summary",
  "detect-duplicate-test-case",
  "diagnosis-chat",
  "draft-bug-report",
  "explain-failure",
  "generate-bug-report",
  "generate-test-case",
  "generate-test-cases",
  "generate-test-cases-from-requirement",
  "plain-english-generate-data",
  "plain-english-generate-steps",
  "suggest-expected-result",
  "bug-assistance:suggest-title",
  "bug-assistance:rewrite-steps",
  "bug-assistance:suggest-severity",
  "bug-assistance:summarize-logs",
  "bug-assistance:developer-summary",
]

describe("QA skills for the app's AI", () => {
  it("has unique ids and short instructions", () => {
    const ids = QA_SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of QA_SKILLS) expect(s.instructions.length).toBeLessThan(MAX_SKILL_CHARS / 2)
  })

  it.each(COMMANDS)("gives %s at least one skill, within budget", (command) => {
    const skills = skillsForCommand(command)
    expect(skills.length).toBeGreaterThan(0)
    expect(skills.length).toBeLessThanOrEqual(MAX_SKILLS_PER_CALL)
    expect(skills.reduce((n, s) => n + s.instructions.length, 0)).toBeLessThanOrEqual(MAX_SKILL_CHARS)
  })

  it("matches the right skills to the right features", () => {
    expect(skillsForCommand("generate-test-case").map((s) => s.id)).toContain("test-design")
    expect(skillsForCommand("bug-assistance:suggest-severity").map((s) => s.id)).toContain("severity")
    expect(skillsForCommand("bug-assistance:suggest-title").map((s) => s.id)).toEqual(["bug-reporting"])
    expect(skillsForCommand("explain-failure").map((s) => s.id)).toEqual(["failure-diagnosis"])
    expect(skillsForCommand("detect-duplicate-test-case").map((s) => s.id)).toEqual(["duplicates"])
  })

  it("leaves unknown or missing commands alone", () => {
    expect(skillsForCommand("something-else")).toEqual([])
    expect(skillsForCommand(undefined)).toEqual([])
    expect(withQaSkills("Return JSON.", "something-else")).toBe("Return JSON.")
    expect(withQaSkills(undefined, undefined)).toBeUndefined()
  })

  it("appends after the original prompt and keeps its output format in charge", () => {
    const out = withQaSkills("Return ONLY one of: Low, Medium, High, Critical.", "bug-assistance:suggest-severity")!
    expect(out.startsWith("Return ONLY one of: Low, Medium, High, Critical.")).toBe(true)
    expect(out).toContain("Severity and priority rubric")
    expect(out).toContain("never changes the required output format")
  })
})

describe("provider-chat attaches skills", () => {
  it("sends the skill block in the system prompt, to Ollama with thinking off", async () => {
    vi.resetModules()
    vi.doMock("@/lib/ai/project-ai-config", () => ({ getProjectAiCredentials: async () => null }))
    vi.doMock("@/lib/db", () => ({
      prisma: {
        aiProviderConfig: { findMany: async () => [{ provider: "Ollama", apiKey: "", model: "qwen3:8b" }] },
        aiUsageEvent: { create: async () => ({}) },
      },
    }))
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: "ok" }, done_reason: "stop", prompt_eval_count: 5, eval_count: 1 }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { chatWithConfiguredProvider } = await import("@/lib/ai/provider-chat")
    await chatWithConfiguredProvider({ system: "You draft bugs.", prompt: "x", command: "draft-bug-report" })

    const [url, init] = fetchMock.mock.calls[0] as any
    // Ollama goes through its native API with thinking off (see callOllamaNative).
    expect(String(url)).toMatch(/\/api\/chat$/)
    const body = JSON.parse(init.body)
    expect(body.think).toBe(false)
    expect(body.stream).toBe(false)
    expect(body.messages[0].role).toBe("system")
    expect(body.messages[0].content).toMatch(/^You draft bugs\./)
    expect(body.messages[0].content).toContain("Bug report writing")
    vi.unstubAllGlobals()
  })
})
