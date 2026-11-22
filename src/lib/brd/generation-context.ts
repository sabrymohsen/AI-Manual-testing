/**
 * The prompt context for generating test cases from one BRD requirement.
 */
import type { Impact } from "@/lib/brd/impact"

export type GenReq = {
  id: string
  key: string
  title: string
  description: string
  taskId: string | null
  acceptanceCriteria: unknown
  section: string | null
  parentKey: string | null
  priority: string | null
  status: string
}

export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

/**
 * What the AI needs to test like a professional tester: the acceptance
 * criteria, the Critical/High impacted requirements it must write regression
 * cases for, and the open questions it must not answer by guessing.
 */
export function buildGenerationContext(
  req: GenReq,
  impacted: Impact[],
  openQuestions: { key: string; question: string }[],
  arabic: boolean
): string {
  const parts = [`${req.key}: ${req.title}`, "", req.description]
  const ac = asList(req.acceptanceCriteria)
  if (ac.length) parts.push("", arabic ? "معايير القبول:" : "Acceptance criteria:", ...ac.map((a, i) => `AC-${i + 1}. ${a}`))
  if (impacted.length) {
    parts.push(
      "",
      arabic
        ? "متطلبات متأثرة (اكتب حالة اختبار انحدار واحدة على الأقل لكل منها، وأضف لها الوسم \"regression\" ومفتاح المتطلب):"
        : "Impacted requirements (write at least one REGRESSION test for each, proving it still works; tag it \"regression\" and the requirement key):",
      ...impacted.map((i) => `- ${i.key} (${i.level}): ${i.title} — ${i.testFocus}`)
    )
  }
  if (openQuestions.length) {
    parts.push(
      "",
      arabic
        ? "أسئلة مفتوحة (لا تفترض الإجابة؛ إذا اعتمدت حالة على أحدها فأضف مفتاح السؤال كوسم مثل Q-01):"
        : "Open questions (do NOT assume an answer; if a test depends on one, add its key as a tag, e.g. Q-01):",
      ...openQuestions.map((q) => `- ${q.key}: ${q.question}`)
    )
  }
  return parts.join("\n")
}

