import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"

const schema = z.object({ testCaseIds: z.array(z.string()) })

const linkSelect = { testCase: { select: { id: true, title: true, priority: true, executionType: true } } } as const

// GET linked test cases for a task
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const links = await prisma.taskTestCase.findMany({ where: { taskId: params.taskId }, include: linkSelect })
  return NextResponse.json({ testCases: links.map((l) => l.testCase) })
}

// POST { testCaseIds } — set link membership to exactly this list (add + remove)
export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  // Only allow test cases that belong to the same project as the task.
  const valid = await prisma.testCase.findMany({
    where: { id: { in: parsed.data.testCaseIds }, projectId: auth.projectId },
    select: { id: true },
  })
  const validIds = valid.map((v) => v.id)

  await prisma.$transaction([
    prisma.taskTestCase.deleteMany({ where: { taskId: params.taskId, testCaseId: { notIn: validIds } } }),
    ...validIds.map((testCaseId) =>
      prisma.taskTestCase.upsert({
        where: { taskId_testCaseId: { taskId: params.taskId, testCaseId } },
        create: { taskId: params.taskId, testCaseId },
        update: {},
      })
    ),
  ])
  await logActivity(params.taskId, "updated", `Linked ${validIds.length} test case(s)`, auth.userId)

  const links = await prisma.taskTestCase.findMany({ where: { taskId: params.taskId }, include: linkSelect })
  return NextResponse.json({ testCases: links.map((l) => l.testCase) })
}
