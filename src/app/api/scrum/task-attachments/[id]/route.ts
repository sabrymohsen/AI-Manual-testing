import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"
import fs from "node:fs"
import path from "node:path"

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, url: true, taskId: true },
  })
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

  const auth = await requireTaskOwner(attachment.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  await prisma.taskAttachment.delete({ where: { id: params.id } })

  // Best-effort removal of the physical file under public/.
  if (attachment.url.startsWith("/uploads/")) {
    try {
      fs.unlinkSync(path.join(process.cwd(), "public", attachment.url))
    } catch {
      /* already gone */
    }
  }

  await logActivity(attachment.taskId, "attachment_removed", `Removed ${attachment.name}`, auth.userId)

  return NextResponse.json({ success: true })
}
