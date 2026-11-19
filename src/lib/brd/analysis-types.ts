/**
 * Shapes of a BRD analysis, shared by the server and the review UI.
 */

export const REQUIREMENT_KINDS = [
  "epic",
  "user_story",
  "functional",
  "non_functional",
  "business_rule",
  "data",
  "integration",
  "report",
  "constraint",
] as const
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number]

export const KIND_LABEL: Record<RequirementKind, { en: string; ar: string; prefix: string }> = {
  epic: { en: "Epic", ar: "ملحمة", prefix: "EPIC" },
  user_story: { en: "User story", ar: "قصة مستخدم", prefix: "US" },
  functional: { en: "Functional", ar: "وظيفي", prefix: "FR" },
  non_functional: { en: "Non-functional", ar: "غير وظيفي", prefix: "NFR" },
  business_rule: { en: "Business rule", ar: "قاعدة عمل", prefix: "BR" },
  data: { en: "Data / field", ar: "بيانات", prefix: "DR" },
  integration: { en: "Integration", ar: "تكامل", prefix: "INT" },
  report: { en: "Report", ar: "تقرير", prefix: "RPT" },
  constraint: { en: "Constraint", ar: "قيد", prefix: "CON" },
}

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const
export type Priority = (typeof PRIORITIES)[number]

export type Language = "ar" | "en" | "mixed"

export interface AnalysisCandidate {
  /** Stable within one analysis. */
  id: string
  /** The document's own number/id for it ("1.01", "FR-12"), if it has one. */
  ref: string | null
  /** Key it would get when added (unique within the BRD at analysis time). */
  key: string
  kind: RequirementKind
  title: string
  description: string
  acceptanceCriteria: string[]
  /** Criteria the AI wrote that aren't in the document's text — removed, shown for review. */
  unsupportedCriteria?: string[]
  priority: Priority | null
  /** Key of the epic it belongs to. */
  parentKey: string | null
  /** Heading path in the document. */
  section: string
  /** Verbatim text from the document. */
  sourceQuote: string
  /** sourceQuote (or the title) was found in the document. */
  verified: boolean
  /** 0..1 — the model's own confidence, lowered when not verified. */
  confidence: number
  language: Language
  /** An already-tracked requirement this matches (filled when read). */
  existingId?: string | null
  existingKey?: string | null
}

export const ISSUE_KINDS = ["ambiguity", "conflict", "missing", "untestable", "question"] as const
export type IssueKind = (typeof ISSUE_KINDS)[number]

export const ISSUE_LABEL: Record<IssueKind, { en: string; ar: string }> = {
  ambiguity: { en: "Ambiguous", ar: "غموض" },
  conflict: { en: "Conflict", ar: "تعارض" },
  missing: { en: "Missing", ar: "نقص" },
  untestable: { en: "Not testable", ar: "غير قابل للاختبار" },
  question: { en: "Question", ar: "سؤال" },
}

export interface AnalysisIssue {
  id: string
  kind: IssueKind
  severity: "high" | "medium" | "low"
  text: string
  quote: string
  section: string
  suggestion: string
  verified: boolean
  /** Keys of the candidates this concerns. */
  relatedKeys: string[]
}

export interface AnalysisView {
  id: string
  status: "queued" | "running" | "done" | "failed" | "applied"
  method: "ai" | "rules"
  provider: string | null
  model: string | null
  language: Language | null
  versionNumber: number | null
  progress: number
  totalChunks: number
  summary: string | null
  candidates: AnalysisCandidate[]
  issues: AnalysisIssue[]
  error: string | null
  createdByName: string | null
  createdAt: string
  finishedAt: string | null
  /** The BRD has a newer version than the one analysed. */
  outdated: boolean
}
