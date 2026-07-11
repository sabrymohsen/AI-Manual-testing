import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"
import type { ProjectPermission } from "@/lib/permissions"
import { z } from "zod"
import { notify } from "@/lib/notifications"
import { logUserActivity } from "@/lib/user-activity"

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  goal: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

async function guard(sprintId: string, permission: ProjectPermission) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const, projectId: null, userId: null }
  const sprint = await prisma.scrumSprint.findUnique({
    where: { id: sprintId },
    select: { projectId: true },
  })
  if (!sprint) return { error: "Sprint not found", status: 404 as const, projectId: null, userId: null }
  const resolved = await resolveProjectRole(sprint.projectId, session.user.id)
  if (!resolved || resolved.role === null)
    return { error: "Access denied", status: 404 as const, projectId: null, userId: null }
  if (!resolved.permissions[permission])
    return { error: `Missing permission: ${permission}`, status: 403 as const, projectId: null, userId: null }
  return { error: null, status: 200 as const, projectId: sprint.projectId, userId: session.user.id }
}

export async function PATCH(request: Request, { params }: { params: { sprintId: string } }) {
  const g = await guard(params.sprintId, "canCreateSprints")
  if (g.error !== null) return NextResponse.json({ error: g.error }, { status: g.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const d = parsed.data

  if (d.status === "ACTIVE") {
    await prisma.scrumSprint.updateMany({
      where: { projectId: g.projectId, status: "ACTIVE", id: { not: params.sprintId } },
      data: { status: "COMPLETED" },
    })
  }

  const data: any = {}
  if (d.name !== undefined) data.name = d.name
  if (d.goal !== undefined) data.goal = d.goal
  if (d.status !== undefined) data.status = d.status
  if (d.startDate !== undefined) data.startDate = d.startDate ? new Date(d.startDate) : null
  if (d.endDate !== undefined) data.endDate = d.endDate ? new Date(d.endDate) : null

  const previous = await prisma.scrumSprint.findUnique({
    where: { id: params.sprintId },
    select: { status: true },
  })

  const sprint = await prisma.scrumSprint.update({
    where: { id: params.sprintId },
    data,
    include: { _count: { select: { tasks: true } } },
  })

  // Sprint kicked off — notify every project member (owner + members) except the actor.
  if (d.status === "ACTIVE" && previous?.status !== "ACTIVE" && g.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: g.projectId },
      select: { userId: true, projectMembers: { select: { userId: true } } },
    })
    if (project) {
      const recipients = [...new Set([project.userId, ...project.projectMembers.map((m) => m.userId)])].filter(
        (id) => id !== g.userId
      )
      notify(
        recipients.map((userId) => ({
          userId,
          type: "SPRINT_STARTED" as const,
          title: "Sprint started",
          body: `${sprint.name} has begun`,
          projectId: g.projectId,
          actionUrl: `/projects/${g.projectId}/scrum`,
        }))
      ).catch(() => {})
      logUserActivity(g.userId!, "SPRINT_STARTED", `Started sprint "${sprint.name}"`, g.projectId)
    }
  }
  if (d.status === "COMPLETED" && previous?.status !== "COMPLETED" && g.userId) {
    logUserActivity(g.userId, "SPRINT_COMPLETED", `Completed sprint "${sprint.name}"`, g.projectId)
  }

  return NextResponse.json({ sprint })
}

export async function DELETE(_req: Request, { params }: { params: { sprintId: string } }) {
  const g = await guard(params.sprintId, "canDeleteSprints")
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.scrumSprint.delete({ where: { id: params.sprintId } })
  return NextResponse.json({ success: true })
}
