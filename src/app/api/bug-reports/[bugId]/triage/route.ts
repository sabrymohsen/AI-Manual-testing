import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"
import { findSimilar } from "@/lib/bug-reports/similarity"
import { buildTriagePrompt, parseTriageReply, DECISION_LABEL, type DuplicateCandidate } from "@/lib/bug-reports/triage"

export const dynamic = "force-dynamic"

const OPEN_STATUSES = ["Open", "InProgress", "Reopened", "ReadyForRetest"]

/**
 * POST /api/bug-reports/:bugId/triage
 *
 * AI triage with the professional-tester rules: one decision (Bug,
 * RequirementIssue, TestIssue, Environment, Duplicate, NotABug), a reason, and
 * a suggested severity/priority. Suggestions only: nothing on the bug changes
 * until the user applies them. The result is noted in the bug's activity log.
 */
export async function POST(_req: Request, { params }: { params: { bugId: string } }) {
  const bug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    select: {
      id: true, projectId: true, bugKey: true, title: true, stepsToReproduce: true, expectedResult: true,
      actualResult: true, environment: true, consoleLogs: true, networkErrors: true, severity: true, priority: true,
    },
  })
  if (!bug) return notFoundResponse("Bug report not found")
  if (!bug.projectId) return NextResponse.json({ error: "This bug isn't linked to any project." }, { status: 409 })
  const auth = await requireProjectMember(bug.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  // Duplicate candidates come from code, so the AI can't invent one.
  const others = await prisma.bugReport.findMany({
    where: { projectId: bug.projectId, id: { not: bug.id }, status: { in: OPEN_STATUSES as any } },
    select: { id: true, bugKey: true, title: true, status: true, severity: true, createdAt: true, stepsToReproduce: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  })
  const candidates: DuplicateCandidate[] = findSimilar(bug.title, bug.stepsToReproduce, others)
    .slice(0, 5)
    .map((m) => ({ id: m.id, bugKey: m.bugKey, title: m.title, score: m.score }))

  let reply: string
  try {
    reply = await chatWithConfiguredProvider({
      prompt: buildTriagePrompt(bug, candidates),
      command: "bug-triage",
      projectId: bug.projectId,
      userId: auth.session!.user.id,
      maxTokens: 500,
      temperature: 0.1,
      timeoutMs: 180_000,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: `The AI couldn't triage this bug${e?.message ? ` (${String(e.message).slice(0, 160)})` : ""}. Check AI settings and try again.`, candidates },
      { status: 502 }
    )
  }
  const result = parseTriageReply(reply ?? "", candidates)
  if (!result) {
    return NextResponse.json({ error: "The AI's answer wasn't usable. Try again.", candidates }, { status: 502 })
  }

  await prisma.bugActivity
    .create({
      data: {
        bugId: bug.id,
        action: "AI triage",
        details: `${DECISION_LABEL[result.decision]}${result.duplicateOf ? ` of ${result.duplicateOf.bugKey ?? result.duplicateOf.id}` : ""}: ${result.reason}${result.severity ? ` Suggested severity ${result.severity}` : ""}${result.priority ? `, priority ${result.priority}` : ""}.`,
      },
    })
    .catch(() => {})

  return NextResponse.json({ result, candidates })
}
