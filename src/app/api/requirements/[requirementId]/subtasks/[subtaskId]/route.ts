import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"

// Editing a subtask is member-level; deleting it stays with owners/admins.
async function guard(reqId: string, ownerOnly = false) {
  const req = await prisma.requirement.findUnique({ where: { id: reqId }, select: { projectId: true } })
  if (!req) return { error: "Not found" }
  const auth = ownerOnly ? await requireProjectOwner(req.projectId) : await requireProjectMember(req.projectId)
  if (auth.error) return { error: auth.error }
  return { ok: true }
}

// PATCH — toggle done, update title/assignee
export async function PATCH(request: Request, { params }: { params: { requirementId: string; subtaskId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  const body = await request.json().catch(() => ({}))
  const data: any = {}
  if (typeof body.done === "boolean") data.done = body.done
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.assignee !== undefined) data.assignee = body.assignee?.trim() || null

  const subtask = await prisma.requirementSubtask.update({
    where: { id: params.subtaskId },
    data,
  })
  return NextResponse.json({ subtask })
}

// DELETE
export async function DELETE(_request: Request, { params }: { params: { requirementId: string; subtaskId: string } }) {
  const g = await guard(params.requirementId, true)
  if (g.error) return unauthorizedResponse(g.error)

  await prisma.requirementSubtask.delete({ where: { id: params.subtaskId } })
  return NextResponse.json({ success: true })
}
