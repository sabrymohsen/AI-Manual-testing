import { describe, it, expect } from "vitest"
import { isTypingTarget } from "@/hooks/scrum/use-board-shortcuts"

const el = (o: Record<string, unknown>) => o as unknown as EventTarget

describe("isTypingTarget", () => {
  it("treats form fields and editors as typing", () => {
    expect(isTypingTarget(el({ tagName: "INPUT" }))).toBe(true)
    expect(isTypingTarget(el({ tagName: "TEXTAREA" }))).toBe(true)
    expect(isTypingTarget(el({ tagName: "SELECT" }))).toBe(true)
    expect(isTypingTarget(el({ tagName: "DIV", isContentEditable: true }))).toBe(true)
  })

  it("treats anything inside a contenteditable as typing", () => {
    expect(isTypingTarget(el({ tagName: "P", isContentEditable: false, closest: () => ({}) }))).toBe(true)
  })

  it("lets plain elements through", () => {
    expect(isTypingTarget(el({ tagName: "DIV", isContentEditable: false, closest: () => null }))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
