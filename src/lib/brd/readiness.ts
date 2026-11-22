/**
 * Readiness gate for a BRD (QA pipeline stage 2): test design waits until the
 * questions that change what a test expects are answered — or a tester records
 * an override with who and why. Pure: safe in the browser and on the server.
 */

export const QUESTION_PRIORITIES = ["High", "Medium", "Low"] as const
export type QuestionPriority = (typeof QUESTION_PRIORITIES)[number]
export const QUESTION_STATUSES = ["Open", "Answered", "Dismissed"] as const
export type QuestionStatus = (typeof QUESTION_STATUSES)[number]
export const ANSWER_SOURCES = ["email", "meeting", "jira", "chat", "other"] as const

export interface GateQuestion {
  key: string
  priority: string
  status: string
  question: string
  relatedKeys?: string[]
}

export interface GateOverride {
  byName: string | null
  why: string | null
  at: string | Date | null
}

export type GateState = "ready" | "blocked" | "override"

export interface Gate {
  state: GateState
  /** Open High/Medium questions: these block test design. */
  blocking: number
  open: number
  answered: number
  dismissed: number
  total: number
  /** Keys of the blocking questions. */
  blockingKeys: string[]
  override: GateOverride | null
}

/** High and Medium questions block (they change a test's expected result); Low ones don't. */
export function isBlocking(q: GateQuestion): boolean {
  return q.status === "Open" && (q.priority === "High" || q.priority === "Medium")
}

export function gateFor(questions: GateQuestion[], override: GateOverride | null): Gate {
  const blockingQs = questions.filter(isBlocking)
  const hasOverride = !!override?.at
  return {
    state: blockingQs.length === 0 ? "ready" : hasOverride ? "override" : "blocked",
    blocking: blockingQs.length,
    open: questions.filter((q) => q.status === "Open").length,
    answered: questions.filter((q) => q.status === "Answered").length,
    dismissed: questions.filter((q) => q.status === "Dismissed").length,
    total: questions.length,
    blockingKeys: blockingQs.map((q) => q.key),
    override: hasOverride ? override : null,
  }
}

/** Open questions that concern one requirement (or the whole document when none name it). */
export function questionsFor(reqKey: string, questions: GateQuestion[]): GateQuestion[] {
  const k = reqKey.toUpperCase()
  return questions.filter((q) => q.status === "Open" && (q.relatedKeys ?? []).some((r) => r.toUpperCase() === k))
}

export function nextQuestionKey(existing: string[]): string {
  let max = 0
  for (const k of existing) {
    const m = /^Q-(\d+)$/i.exec(k)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `Q-${String(max + 1).padStart(2, "0")}`
}

/** A stakeholder email listing the open questions (a draft — the app never sends it). */
export function stakeholderEmail(
  brdName: string,
  questions: (GateQuestion & { why?: string | null; askTo?: string | null })[],
  senderName?: string | null
): { subject: string; body: string } {
  const open = questions.filter((q) => q.status === "Open")
  const order = { High: 0, Medium: 1, Low: 2 } as Record<string, number>
  open.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3) || a.key.localeCompare(b.key))
  const lines = open.map((q) => {
    const tags = [q.priority, q.relatedKeys?.length ? q.relatedKeys.join(", ") : null].filter(Boolean).join(" · ")
    return `${q.key} (${tags})\n${q.question}${q.why ? `\nWhy it matters: ${q.why}` : ""}`
  })
  const blocking = open.filter(isBlocking).length
  return {
    subject: `Questions on "${brdName}" before testing (${open.length} open${blocking ? `, ${blocking} blocking` : ""})`,
    body: [
      "Hello,",
      "",
      `While preparing the tests for "${brdName}" we found points the document does not settle yet. We won't guess the answers, so ${blocking ? `${blocking} of them block test design until they are answered` : "please confirm them when you can"}.`,
      "",
      ...lines.flatMap((l) => [l, ""]),
      "Please reply with an answer for each question id.",
      "",
      "Thank you,",
      senderName || "QA",
    ].join("\n"),
  }
}
