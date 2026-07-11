import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import type { ProjectPermission } from "@/lib/permissions"
import { z } from "zod"

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  wipLimit: z.number().int().min(0).optional().nullable(),
  order: z.number().int().optional(),
})

async function guard(columnId: string, permission: ProjectPermission) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const, status_: null }
  const column = await prisma.boardColumn.findUnique({
    where: { id: columnId },
    select: { status: true, projectId: true },
  })
  if (!column) return { error: "Column not found", status: 404 as const, status_: null }
  const resolved = await resolveProjectRole(column.projectId, session.user.id)
  if (!resolved || resolved.role === null) return { error: "Access denied", status: 404 as const, status_: null }
  if (!resolved.permissions[permission]) return { error: `Missing permission: ${permission}`, status: 403 as const, status_: null }
  return { error: null, status: 200 as const, status_: column.status }
}

export async function PATCH(request: Request, { params }: { params: { columnId: string } }) {
  const g = await guard(params.columnId, "canEditBoard")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const column = await prisma.boardColumn.update({ where: { id: params.columnId }, data: parsed.data })
  return NextResponse.json({ column })
}

export async function DELETE(_req: Request, { params }: { params: { columnId: string } }) {
  const g = await guard(params.columnId, "canEditBoard")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.boardColumn.delete({ where: { id: params.columnId } })
  return NextResponse.json({ success: true })
}
