import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import type { ProjectPermission } from "@/lib/permissions"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

async function guard(epicId: string, permission: ProjectPermission) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const }
  const epic = await prisma.scrumEpic.findUnique({
    where: { id: epicId },
    select: { projectId: true },
  })
  if (!epic) return { error: "Epic not found", status: 404 as const }
  const resolved = await resolveProjectRole(epic.projectId, session.user.id)
  if (!resolved || resolved.role === null) return { error: "Access denied", status: 404 as const }
  if (!resolved.permissions[permission]) return { error: `Missing permission: ${permission}`, status: 403 as const }
  return { error: null, status: 200 as const }
}

export async function PATCH(request: Request, { params }: { params: { epicId: string } }) {
  const g = await guard(params.epicId, "canCreateEpics")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const epic = await prisma.scrumEpic.update({
    where: { id: params.epicId },
    data: parsed.data,
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({ epic })
}

export async function DELETE(_req: Request, { params }: { params: { epicId: string } }) {
  const g = await guard(params.epicId, "canDeleteEpics")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.scrumEpic.delete({ where: { id: params.epicId } })
  return NextResponse.json({ success: true })
}
