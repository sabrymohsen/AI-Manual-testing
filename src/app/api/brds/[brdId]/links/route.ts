import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { notify } from "@/lib/notifications"
import { z } from "zod"
import { requireBrdAccess, brdAudit } from "@/lib/brd/server"

const MAX_LINKS = 50

const schema = z.object({
  linkType: z.enum(["epic", "story"]),
  epicId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
})

// POST /api/brds/:brdId/links -> link this BRD to an Epic or User Story (Task)
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true, unlocked: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const { linkType, epicId, taskId } = parsed.data

  const count = await prisma.brdLink.count({ where: { brdId: brd.id } })
  if (count >= MAX_LINKS) {
    return NextResponse.json({ error: `A BRD can link to at most ${MAX_LINKS} items` }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: brd.projectId },
    select: { boardKey: true },
  })

  let label = ""
  let notifyUserIds: string[] = []

  if (linkType === "epic") {
    if (!epicId) return NextResponse.json({ error: "epicId is required" }, { status: 400 })
    const epic = await prisma.scrumEpic.findFirst({ where: { id: epicId, projectId: brd.projectId } })
    if (!epic) return NextResponse.json({ error: "Epic not found in this project" }, { status: 404 })
    const exists = await prisma.brdLink.findFirst({ where: { brdId: brd.id, epicId } })
    if (exists) return NextResponse.json({ error: "Already linked" }, { status: 409 })
    label = epic.title
  } else {
    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 })
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId: brd.projectId },
      include: { assignees: { select: { id: true } } },
    })
    if (!task) return NextResponse.json({ error: "Story not found in this project" }, { status: 404 })
    const exists = await prisma.brdLink.findFirst({ where: { brdId: brd.id, taskId } })
    if (exists) return NextResponse.json({ error: "Already linked" }, { status: 409 })
    const key = project?.boardKey ? `${project.boardKey}-${task.taskNumber}` : `#${task.taskNumber}`
    label = `${key} · ${task.title}`
    notifyUserIds = task.assignees.map((a) => a.id).filter((id) => id !== user.id)
  }

  const link = await prisma.brdLink.create({
    data: {
      brdId: brd.id,
      linkType,
      epicId: linkType === "epic" ? epicId : null,
      taskId: linkType === "story" ? taskId : null,
      label,
      createdById: user.id,
    },
  })
  await brdAudit(brd.id, "link_added", `Linked ${linkType}: ${label}`, user)

  if (notifyUserIds.length > 0) {
    notify(
      notifyUserIds.map((userId) => ({
        userId,
        type: "SYSTEM" as const,
        title: "BRD linked to your story",
        body: `A BRD was linked to your story: ${label}`,
        projectId: brd.projectId,
        actionUrl: `/projects/${brd.projectId}/brds/${brd.id}`,
      }))
    ).catch(() => {})
  }

  return NextResponse.json({ link: { id: link.id, linkType, label } }, { status: 201 })
}
