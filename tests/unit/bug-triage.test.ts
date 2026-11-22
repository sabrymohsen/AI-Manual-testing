import { describe, it, expect } from "vitest"
import { buildTriagePrompt, parseTriageReply, type DuplicateCandidate } from "@/lib/bug-reports/triage"

const cands: DuplicateCandidate[] = [{ id: "b-7", bugKey: "BUG-0007", title: "Login error text missing prefix", score: 72 }]

describe("AI bug triage", () => {
  it("puts the evidence and the duplicate candidates in the prompt", () => {
    const p = buildTriagePrompt(
      { title: "Login error", stepsToReproduce: "1. Submit empty password", expectedResult: "Password is required", actualResult: "Epic sadface: Password is required", consoleLogs: "TypeError x" },
      cands
    )
    expect(p).toContain("Expected: Password is required")
    expect(p).toContain("BUG-0007")
    expect(p).toContain("Console errors: TypeError x")
    expect(p).toContain("RequirementIssue")
  })

  it("reads a normal reply, even with a raw line break and a <think> block", () => {
    const r = parseTriageReply(
      '<think>hmm</think>```json\n{"decision":"Bug","reason":"The page shows\nthe wrong text.","severity":"high","priority":"Medium","duplicateOf":null,"question":null,"confidence":0.8}\n```',
      cands
    )!
    expect(r.decision).toBe("Bug")
    expect(r.severity).toBe("High")
    expect(r.priority).toBe("Medium")
    expect(r.reason).toContain("wrong text")
    expect(r.confidence).toBe(0.8)
  })

  it("accepts a duplicate only of a candidate the code offered", () => {
    const ok = parseTriageReply('{"decision":"Duplicate","reason":"same","duplicateOf":"BUG-0007","confidence":0.9}', cands)!
    expect(ok.decision).toBe("Duplicate")
    expect(ok.duplicateOf?.id).toBe("b-7")
    const invented = parseTriageReply('{"decision":"Duplicate","reason":"same","duplicateOf":"BUG-0999"}', cands)!
    expect(invented.decision).toBe("Bug")
    expect(invented.duplicateOf).toBeNull()
  })

  it("keeps the business question only for requirement issues", () => {
    const r = parseTriageReply('{"decision":"requirement_issue","reason":"AC unclear","question":"Which text is right?"}', cands)!
    expect(r.decision).toBe("RequirementIssue")
    expect(r.question).toBe("Which text is right?")
    expect(parseTriageReply('{"decision":"Bug","reason":"x","question":"Why?"}', cands)!.question).toBeNull()
  })

  it("rejects unusable replies", () => {
    expect(parseTriageReply("I think it's a bug", cands)).toBeNull()
    expect(parseTriageReply('{"decision":"Maybe"}', cands)).toBeNull()
  })
})
