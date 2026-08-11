import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

// DELETE /api/entity-links/:linkId
export async function DELETE(_request: Request, { params }: { params: { linkId: string } }) {
  const link = await prisma.entityLink.findUnique({ where: { id: params.linkId } })
  // Same 404 whether it never existed or the caller can't see its project, so
  // this can't be used to probe for link ids in other people's projects.
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  const auth = await requireProjectMember(link.projectId)
  if (auth.error) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  try {
    await prisma.entityLink.delete({ where: { id: params.linkId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("DELETE entity-link failed:", err)
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 })
  }
}
