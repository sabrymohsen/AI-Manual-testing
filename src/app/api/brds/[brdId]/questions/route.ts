import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdAccess, requireBrdTestAccess, brdAudit } from "@/lib/brd/server"
import { importQuestionsFromIssues, loadGate } from "@/lib/brd/questions"
import { nextQuestionKey, QUESTION_PRIORITIES } from "@/lib/brd/readiness"
import type { AnalysisIssue } from "@/lib/brd/analysis-types"

export const dynamic = "force-dynamic"

/**
 * GET  /api/brds/:brdId/questions — open questions + the readiness gate.
 * POST /api/brds/:brdId/questions — { question, why?, priority?, relatedKeys?, askTo? } adds one;
 *      { action: "import" } turns the latest analysis's issues into questions.
 */
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const [questions, gate] = await Promise.all([
    prisma.brdQuestion.findMany({ where: { brdId: params.brdId }, orderBy: { key: "asc" } }),
    loadGate(params.brdId),
  ])
  const latestAnalysis = await prisma.brdAnalysis.findFirst({
    where: { brdId: params.brdId, status: { in: ["done", "applied"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, issues: true },
  })
  const issueCount = Array.isArray(latestAnalysis?.issues) ? (latestAnalysis!.issues as unknown[]).length : 0
  return NextResponse.json({ questions, gate, brdName: access.brd!.name, analysisIssues: issueCount })
}

const createSchema = z.object({
  question: z.string().trim().min(3).max(4000),
  why: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(QUESTION_PRIORITIES).optional(),
  relatedKeys: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  askTo: z.string().trim().max(60).optional().nullable(),
})

export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const user = access.session!.user
  const body = await request.json().catch(() => null)

  if (body?.action === "import") {
    const analysis = await prisma.brdAnalysis.findFirst({
      where: { brdId: params.brdId, status: { in: ["done", "applied"] } },
      orderBy: { createdAt: "desc" },
      select: { issues: true },
    })
    if (!analysis) return NextResponse.json({ error: "Run an analysis first (Requirements & coverage → Analyze)." }, { status: 400 })
    const added = await importQuestionsFromIssues(params.brdId, (analysis.issues as unknown as AnalysisIssue[]) || [], user)
    if (added) await brdAudit(params.brdId, "questions_imported", `${added} open question(s) from the analysis`, user)
    return NextResponse.json({ added, gate: await loadGate(params.brdId) })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 })
  const d = parsed.data
  const keys = (await prisma.brdQuestion.findMany({ where: { brdId: params.brdId }, select: { key: true } })).map((q) => q.key)
  const question = await prisma.brdQuestion.create({
    data: {
      brdId: params.brdId,
      key: nextQuestionKey(keys),
      question: d.question,
      why: d.why || null,
      priority: d.priority ?? "Medium",
      relatedKeys: d.relatedKeys ?? [],
      askTo: d.askTo || null,
      origin: "manual",
      createdById: user.id,
      createdByName: user.name ?? user.email ?? null,
    },
  })
  await brdAudit(params.brdId, "question_added", `${question.key}: ${question.question.slice(0, 120)}`, user)
  return NextResponse.json({ question, gate: await loadGate(params.brdId) }, { status: 201 })
}
