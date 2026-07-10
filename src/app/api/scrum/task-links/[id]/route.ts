import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const link = await prisma.taskLink.findUnique({
    where: { id: params.id },
    select: { id: true, sourceId: true, type: true, target: { select: { taskNumber: true } } },
  })
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  const auth = await requireTaskOwner(link.sourceId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  await prisma.taskLink.delete({ where: { id: params.id } })
  await logActivity(link.sourceId, "unlinked", `${link.type} ${auth.boardKey || "TASK"}-${link.target.taskNumber}`, auth.userId)

  return NextResponse.json({ success: true })
}
