import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdTestAccess, brdAudit } from "@/lib/brd/server"
import { loadGate } from "@/lib/brd/questions"
import { ANSWER_SOURCES, QUESTION_PRIORITIES, QUESTION_STATUSES } from "@/lib/brd/readiness"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  question: z.string().trim().min(3).max(4000).optional(),
  why: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(QUESTION_PRIORITIES).optional(),
  relatedKeys: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  askTo: z.string().trim().max(60).nullable().optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  /** Answering sets the status to Answered and records who answered it. */
  answer: z.string().trim().min(1).max(4000).optional(),
  answerSource: z.enum(ANSWER_SOURCES).optional(),
})

async function load(brdId: string, questionId: string) {
  return prisma.brdQuestion.findFirst({ where: { id: questionId, brdId } })
}

/** PATCH edits, answers, reopens or dismisses a question. */
export async function PATCH(request: Request, { params }: { params: { brdId: string; questionId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const q = await load(params.brdId, params.questionId)
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 })
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Validation failed" }, { status: 400 })
  const d = parsed.data
  const user = access.session!.user

  if (d.status === "Answered" && !d.answer && !q.answer) {
    return NextResponse.json({ error: "Write the answer before marking it answered." }, { status: 400 })
  }
  const answering = d.answer !== undefined
  const status = answering ? "Answered" : d.status
  const { answer, answerSource, ...rest } = d

  const question = await prisma.brdQuestion.update({
    where: { id: q.id },
    data: {
      ...rest,
      ...(status ? { status } : {}),
      ...(answering
        ? {
            answer,
            answerSource: answerSource ?? q.answerSource ?? "other",
            answeredById: user.id,
            answeredByName: user.name ?? user.email ?? null,
            answeredAt: new Date(),
          }
        : {}),
      // Reopening clears the old answer's sign-off but keeps its text for reference.
      ...(status === "Open" ? { answeredAt: null, answeredById: null, answeredByName: null } : {}),
    },
  })
  if (status && status !== q.status) {
    await brdAudit(params.brdId, "question_status", `${q.key}: ${q.status} → ${status}`, user)
  }
  return NextResponse.json({ question, gate: await loadGate(params.brdId) })
}

export async function DELETE(_req: Request, { params }: { params: { brdId: string; questionId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const q = await load(params.brdId, params.questionId)
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 })
  await prisma.brdQuestion.delete({ where: { id: q.id } })
  await brdAudit(params.brdId, "question_deleted", `${q.key}: ${q.question.slice(0, 120)}`, access.session!.user)
  return NextResponse.json({ success: true, gate: await loadGate(params.brdId) })
}
