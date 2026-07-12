import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireBrdAccess } from "@/lib/brd/server"

// PATCH /api/brds/:brdId/annotations/:annotationId -> resolve / unresolve a comment
export async function PATCH(
  request: Request,
  { params }: { params: { brdId: string; annotationId: string } }
) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const annotation = await prisma.brdAnnotation.findFirst({
    where: { id: params.annotationId, brdId: params.brdId },
  })
  if (!annotation) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAuthor = annotation.authorId === access.session!.user.id
  if (!isAuthor && !access.resolved!.permissions.canManageBrds) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  }

  let body: any = {}
  try { body = await request.json() } catch {}
  const resolved = typeof body.resolved === "boolean" ? body.resolved : !annotation.resolved

  const updated = await prisma.brdAnnotation.update({
    where: { id: annotation.id },
    data: { resolved },
  })
  return NextResponse.json({ annotation: { id: updated.id, resolved: updated.resolved } })
}

// DELETE /api/brds/:brdId/annotations/:annotationId -> remove an annotation
// (author, or anyone who can manage the BRD).
export async function DELETE(
  _req: Request,
  { params }: { params: { brdId: string; annotationId: string } }
) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const annotation = await prisma.brdAnnotation.findFirst({
    where: { id: params.annotationId, brdId: params.brdId },
  })
  if (!annotation) return NextResponse.json({ error: "Annotation not found" }, { status: 404 })

  const isAuthor = annotation.authorId === access.session!.user.id
  if (!isAuthor && !access.resolved!.permissions.canManageBrds) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  }

  await prisma.brdAnnotation.delete({ where: { id: annotation.id } })
  return NextResponse.json({ success: true })
}
