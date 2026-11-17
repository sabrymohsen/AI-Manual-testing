import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

// DELETE — only the person who saved a view can delete it.
export async function DELETE(_req: Request, { params }: { params: { projectId: string; viewId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { count } = await prisma.scrumSavedView.deleteMany({
    where: { id: params.viewId, projectId: params.projectId, userId: auth.session!.user.id },
  })
  if (!count) return NextResponse.json({ error: "View not found, or it belongs to someone else" }, { status: 404 })
  return NextResponse.json({ success: true })
}
