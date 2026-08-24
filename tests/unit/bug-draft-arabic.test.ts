import { describe, it, expect, vi } from "vitest"

// Provider clients are reached only by the AI paths, not by the fallback.
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/ai/test-case-generator", () => ({ getOllamaModels: vi.fn(async () => []) }))
vi.mock("@/lib/ai/provider-chat", () => ({
  chatWithConfiguredProvider: vi.fn(),
  hasConfiguredProvider: vi.fn(async () => false),
}))

import { ruleBasedDraft } from "@/lib/ai/generate-bug-report"

const draft = (description: string) => ruleBasedDraft({ description } as any)

describe("ruleBasedDraft with an Arabic note", () => {
  it("answers in Arabic instead of injecting an English sentence", () => {
    const d = draft("زر الدفع لا يعمل عند الضغط عليه في الجوال")
    expect(d.expectedResult).toBe("يجب أن يكتمل الإجراء المذكور دون خطأ.")
    expect(d.expectedResult).not.toMatch(/[A-Za-z]/)
  })

  it("still answers in English for an English note", () => {
    const d = draft("The checkout button does nothing on mobile")
    expect(d.expectedResult).toBe("The described action should complete without error.")
  })

  it("reads severity from Arabic keywords, not only English ones", () => {
    // Previously every Arabic note scored "Medium" however it was worded.
    expect(draft("التطبيق لا يعمل بعد تسجيل الدخول").severity).toBe("High")
    expect(draft("خطأ حرج في صفحة الدفع").severity).toBe("Critical")
    expect(draft("خطأ إملائي في العنوان").severity).toBe("Low")
  })

  it("keeps the tester's own words as the title and steps", () => {
    const d = draft("لا يمكن حفظ الملف الشخصي؟ تظهر رسالة خطأ")
    expect(d.title).toContain("لا يمكن حفظ الملف الشخصي")
    expect(d.steps.length).toBeGreaterThan(0)
    expect(d.steps[0].actionDescription).not.toBe("")
  })

  it("splits on the Arabic question mark, which is not '?'", () => {
    // U+061F. Splitting on ASCII punctuation alone left this as one long step.
    const d = draft("فتحت الصفحة؟ ثم ضغطت زر الحفظ")
    expect(d.steps.length).toBe(2)
  })

  it("leaves severity at the sensible default for a neutral note", () => {
    expect(draft("الصفحة تحتاج مراجعة").severity).toBe("Medium")
  })
})
