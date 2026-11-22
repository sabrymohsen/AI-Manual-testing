/**
 * AI bug triage with the professional-tester rules (AI_Skills_project, stage 5):
 * every finding gets ONE decision — Bug, RequirementIssue, TestIssue,
 * Environment, Duplicate or NotABug — with a reason, plus a suggested severity
 * and priority. Duplicate candidates come from code (similarity), never from
 * the model's imagination, and the model may only pick one of them.
 */
import { sanitizeJsonControlChars } from "@/lib/json-sanitize"

export const TRIAGE_DECISIONS = ["Bug", "RequirementIssue", "TestIssue", "Environment", "Duplicate", "NotABug"] as const
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number]
const LEVELS = ["Critical", "High", "Medium", "Low"] as const
type Level = (typeof LEVELS)[number]

export const DECISION_LABEL: Record<TriageDecision, string> = {
  Bug: "Real product bug",
  RequirementIssue: "Requirement issue (not a bug)",
  TestIssue: "Test issue (the test is wrong)",
  Environment: "Environment problem",
  Duplicate: "Duplicate",
  NotABug: "Not a bug",
}

export interface TriageInput {
  title: string
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  environment?: string | null
  consoleLogs?: string | null
  networkErrors?: string | null
  severity?: string | null
  priority?: string | null
}

export interface DuplicateCandidate {
  id: string
  bugKey: string | null
  title: string
  score: number
}

export interface TriageResult {
  decision: TriageDecision
  reason: string
  severity: Level | null
  priority: Level | null
  /** Set only when decision is Duplicate, and only to a given candidate. */
  duplicateOf: { id: string; bugKey: string | null; title: string } | null
  /** Question to ask when the expected result isn't confirmed. */
  question: string | null
  confidence: number
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+\n/g, "\n").trim().slice(0, n)

export function buildTriagePrompt(bug: TriageInput, candidates: DuplicateCandidate[]): string {
  return [
    "Triage this bug report. Decide exactly ONE of:",
    "- Bug: the evidence shows the product behaving wrongly against a confirmed expected result.",
    "- RequirementIssue: the expected result is not confirmed or the requirement is unclear/contradictory (then write the question to ask).",
    "- TestIssue: the test did not run as designed (wrong step, wrong locator, wrong data).",
    "- Environment: the site/server/network/credentials were unavailable.",
    "- Duplicate: the SAME cause as one of the listed candidates (only pick from the list).",
    "- NotABug: the behaviour is correct or the report has no evidence of a problem.",
    "Severity: Critical = core flow blocked, data loss, security, money; High = feature wrong, no reasonable workaround; Medium = wrong with a workaround or misleading message; Low = cosmetic.",
    "Priority: Critical/High/Medium/Low by urgency. Quote only facts from the report; do not invent details.",
    "",
    `Title: ${clip(bug.title, 300)}`,
    `Environment: ${clip(bug.environment, 80) || "unknown"}`,
    `Current severity/priority: ${bug.severity ?? "?"} / ${bug.priority ?? "?"}`,
    `Steps:\n${clip(bug.stepsToReproduce, 1500) || "(none)"}`,
    `Expected: ${clip(bug.expectedResult, 600) || "(not stated)"}`,
    `Actual: ${clip(bug.actualResult, 600) || "(not stated)"}`,
    bug.consoleLogs ? `Console errors: ${clip(bug.consoleLogs, 500)}` : "",
    bug.networkErrors ? `Failed requests: ${clip(bug.networkErrors, 400)}` : "",
    "",
    candidates.length
      ? `Possible duplicates (open bugs with similar wording):\n${candidates.map((c) => `- ${c.bugKey ?? c.id}: ${clip(c.title, 140)}`).join("\n")}`
      : "Possible duplicates: none.",
    "",
    'Reply with JSON only: {"decision":"Bug|RequirementIssue|TestIssue|Environment|Duplicate|NotABug","reason":"one or two sentences","severity":"Critical|High|Medium|Low","priority":"Critical|High|Medium|Low","duplicateOf":"<key from the list or null>","question":"<question for the business, or null>","confidence":0.0-1.0}',
  ]
    .filter((l) => l !== "")
    .join("\n")
}

function pickLevel(v: unknown): Level | null {
  const s = String(v ?? "").trim().toLowerCase()
  return (LEVELS.find((l) => l.toLowerCase() === s) as Level) ?? null
}

function pickDecision(v: unknown): TriageDecision | null {
  const s = String(v ?? "").replace(/[\s_-]/g, "").toLowerCase()
  return TRIAGE_DECISIONS.find((d) => d.toLowerCase() === s) ?? null
}

/** Reads the model's reply. Null when it isn't usable. */
export function parseTriageReply(text: string, candidates: DuplicateCandidate[]): TriageResult | null {
  const m = /\{[\s\S]*\}/.exec(text.replace(/<think>[\s\S]*?<\/think>/g, ""))
  if (!m) return null
  let raw: any
  try {
    raw = JSON.parse(sanitizeJsonControlChars(m[0]))
  } catch {
    return null
  }
  let decision = pickDecision(raw.decision)
  if (!decision) return null

  let duplicateOf: TriageResult["duplicateOf"] = null
  if (decision === "Duplicate") {
    const want = String(raw.duplicateOf ?? "").trim().toLowerCase()
    const hit = candidates.find((c) => (c.bugKey ?? "").toLowerCase() === want || c.id.toLowerCase() === want)
    // Never trust a duplicate the code didn't offer.
    if (hit) duplicateOf = { id: hit.id, bugKey: hit.bugKey, title: hit.title }
    else decision = "Bug"
  }
  const conf = Number(raw.confidence)
  const question = typeof raw.question === "string" && raw.question.trim() && raw.question.trim().toLowerCase() !== "null" ? raw.question.trim() : null
  return {
    decision,
    reason: String(raw.reason ?? "").trim().slice(0, 600) || DECISION_LABEL[decision],
    severity: pickLevel(raw.severity),
    priority: pickLevel(raw.priority),
    duplicateOf,
    question: decision === "RequirementIssue" ? question : null,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
  }
}
