import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"

const schema = z.object({ bugIds: z.array(z.string()) })

const linkSelect = {
  bugReport: { select: { id: true, bugKey: true, title: true, severity: true, status: true } },
} as const

// GET linked bugs for a task
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const links = await prisma.taskBug.findMany({ where: { taskId: params.taskId }, include: linkSelect })
  return NextResponse.json({ bugs: links.map((l) => l.bugReport) })
}

// POST { bugIds } — set link membership to exactly this list (add + remove)
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

  const valid = await prisma.bugReport.findMany({
    where: { id: { in: parsed.data.bugIds }, projectId: auth.projectId },
    select: { id: true },
  })
  const validIds = valid.map((v) => v.id)

  await prisma.$transaction([
    prisma.taskBug.deleteMany({ where: { taskId: params.taskId, bugReportId: { notIn: validIds } } }),
    ...validIds.map((bugReportId) =>
      prisma.taskBug.upsert({
        where: { taskId_bugReportId: { taskId: params.taskId, bugReportId } },
        create: { taskId: params.taskId, bugReportId },
        update: {},
      })
    ),
  ])
  await logActivity(params.taskId, "updated", `Linked ${validIds.length} bug(s)`, auth.userId)

  const links = await prisma.taskBug.findMany({ where: { taskId: params.taskId }, include: linkSelect })
  return NextResponse.json({ bugs: links.map((l) => l.bugReport) })
}
