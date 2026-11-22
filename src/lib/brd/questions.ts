/**
 * Server side of BRD open questions and the readiness gate.
 */
import { prisma } from "@/lib/db"
import { normalize } from "@/lib/brd/text-utils"
import { brdAudit } from "@/lib/brd/server"
import { gateFor, nextQuestionKey, type Gate } from "@/lib/brd/readiness"
import type { AnalysisIssue } from "@/lib/brd/analysis-types"

export async function loadGate(brdId: string): Promise<Gate> {
  const [questions, brd] = await Promise.all([
    prisma.brdQuestion.findMany({ where: { brdId }, select: { key: true, priority: true, status: true, question: true, relatedKeys: true } }),
    prisma.brdDocument.findUnique({ where: { id: brdId }, select: { gateOverrideByName: true, gateOverrideWhy: true, gateOverrideAt: true } }),
  ])
  return gateFor(
    questions,
    brd?.gateOverrideAt ? { byName: brd.gateOverrideByName, why: brd.gateOverrideWhy, at: brd.gateOverrideAt } : null
  )
}

const PRIORITY: Record<string, string> = { high: "High", medium: "Medium", low: "Low" }

/**
 * Turns an analysis's issues (ambiguous, conflicting, missing, untestable,
 * questions) into open questions. Skips any whose text is already a question
 * on this BRD, so it is safe to run again.
 */
export async function importQuestionsFromIssues(
  brdId: string,
  issues: AnalysisIssue[],
  actor: { id?: string; name?: string | null }
): Promise<number> {
  if (!issues?.length) return 0
  const existing = await prisma.brdQuestion.findMany({ where: { brdId }, select: { key: true, question: true } })
  const seen = new Set(existing.map((q) => normalize(q.question)))
  const keys = existing.map((q) => q.key)
  let added = 0
  for (const i of issues) {
    const text = (i.text || "").trim()
    if (!text) continue
    const n = normalize(text)
    if (!n || seen.has(n)) continue
    seen.add(n)
    const key = nextQuestionKey(keys)
    keys.push(key)
    await prisma.brdQuestion.create({
      data: {
        brdId,
        key,
        question: text.slice(0, 4000),
        why: i.suggestion?.trim() || null,
        kind: i.kind || "question",
        priority: PRIORITY[i.severity] ?? "Medium",
        relatedKeys: (i.relatedKeys ?? []).slice(0, 20),
        quote: i.quote?.trim() || null,
        section: i.section?.trim() || null,
        origin: "analysis",
        createdById: actor.id ?? null,
        createdByName: actor.name ?? null,
        // Already resolved in the Issues tab: its accepted criteria are the answer.
        ...(i.resolution
          ? {
              status: "Answered",
              answer: [i.resolution.title, ...i.resolution.criteria.map((c) => `• ${c}`)].join("\n").slice(0, 8000),
              answerSource: "other",
              answeredByName: i.resolution.byName,
              answeredAt: new Date(i.resolution.at),
            }
          : {}),
      },
    })
    added++
  }
  return added
}

/** Records a tester override of the readiness gate (who, why, when) in the BRD and its audit log. */
export async function recordOverride(brdId: string, why: string, user: { id: string; name?: string | null; email?: string }) {
  const gate = await loadGate(brdId)
  await prisma.brdDocument.update({
    where: { id: brdId },
    data: {
      gateOverrideAt: new Date(),
      gateOverrideById: user.id,
      gateOverrideByName: user.name ?? user.email ?? null,
      gateOverrideWhy: why,
    },
  })
  await brdAudit(
    brdId,
    "gate_override",
    `Tester override with ${gate.blocking} blocking question(s) open (${gate.blockingKeys.join(", ") || "none"}): ${why}`,
    user
  )
}
