import { describe, it, expect, vi } from "vitest"

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/ai/test-case-generator", () => ({ getOllamaModels: vi.fn(async () => []) }))
vi.mock("@/lib/ai/provider-chat", () => ({
  chatWithConfiguredProvider: vi.fn(),
  hasConfiguredProvider: vi.fn(async () => false),
}))

import { buildPrompt } from "@/lib/ai/generate-bug-report"
import {
  BUG_REPORT_CRAFT,
  SEVERITY_PRIORITY_RUBRIC,
  TEST_DESIGN_CRAFT,
  LANGUAGE_RULE,
} from "@/lib/ai/qa-craft"

const prompt = (description: string) =>
  buildPrompt({ description, appUrl: null, imageBase64: null } as any, false)

describe("bug report prompt carries the QA craft", () => {
  it("embeds the craft and the rubric, fully interpolated", () => {
    const p = prompt("checkout button does nothing")
    expect(p).toContain(BUG_REPORT_CRAFT)
    expect(p).toContain(SEVERITY_PRIORITY_RUBRIC)
    expect(p).toContain(LANGUAGE_RULE)
    // A template literal that failed to interpolate would leave the raw name.
    expect(p).not.toContain("${")
  })

  it("still carries the tester's note and the JSON contract", () => {
    const p = prompt("checkout button does nothing")
    expect(p).toContain("checkout button does nothing")
    expect(p).toContain('"severity": "Low | Medium | High | Critical"')
    expect(p).toContain("Output valid JSON only.")
  })
})

describe("qa-craft content", () => {
  it("keeps severity and priority as separate judgements", () => {
    // The whole point of the rubric: models default to copying one into the other.
    expect(SEVERITY_PRIORITY_RUBRIC).toMatch(/independent/i)
    expect(SEVERITY_PRIORITY_RUBRIC).toMatch(/do not simply copy/i)
  })

  it("names the test design techniques rather than gesturing at coverage", () => {
    for (const technique of [
      /equivalence partitioning/i,
      /boundary value analysis/i,
      /state transitions/i,
      /error guessing/i,
    ]) {
      expect(TEST_DESIGN_CRAFT).toMatch(technique)
    }
  })

  it("requires atomic, independent, deterministic cases", () => {
    expect(TEST_DESIGN_CRAFT).toMatch(/atomic/i)
    expect(TEST_DESIGN_CRAFT).toMatch(/independent/i)
    expect(TEST_DESIGN_CRAFT).toMatch(/deterministic/i)
  })

  it("forbids the vague expected results that make a case unrunnable", () => {
    expect(TEST_DESIGN_CRAFT).toMatch(/works correctly/i)
  })

  it("keeps enum values in English so normalize() does not discard them", () => {
    expect(LANGUAGE_RULE).toMatch(/in English/i)
  })
})
