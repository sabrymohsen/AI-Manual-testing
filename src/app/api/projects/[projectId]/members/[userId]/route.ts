import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission } from "@/lib/api-guards"
import { normalizeRole, PROJECT_ROLES, OVERRIDE_KEYS, type ProjectRole } from "@/lib/permissions"

type Params = { params: { projectId: string; userId: string } }

// Resolve a target user's current role within the project.
async function targetRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) return null
  if (project.userId === userId) return "Owner"
  const m = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  return m ? normalizeRole(m.role) : null
}

// PATCH — change a member's role (or transfer ownership), and/or set overrides.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireProjectPermission(params.projectId, "canManageMembers")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const callerRole = auth.resolved.role
  const target = params.userId

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { userId: true },
  })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const currentTargetRole = await targetRole(params.projectId, target)
  if (!currentTargetRole) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  const newRole: string | undefined = body.role
  if (newRole !== undefined && !PROJECT_ROLES.includes(newRole as ProjectRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  // Only an Owner may modify another Owner or an Admin, or grant Owner.
  const targetIsPrivileged = currentTargetRole === "Owner" || currentTargetRole === "Admin"
  if (callerRole !== "Owner" && (targetIsPrivileged || newRole === "Owner")) {
    return NextResponse.json(
      { error: "Only an Owner can modify Owners/Admins or transfer ownership" },
      { status: 403 }
    )
  }

  // ── Ownership transfer ──
  if (newRole === "Owner") {
    if (callerRole !== "Owner") {
      return NextResponse.json({ error: "Only an Owner can transfer ownership" }, { status: 403 })
    }
    if (target === project.userId) {
      return NextResponse.json({ error: "That user is already the Owner" }, { status: 409 })
    }
    await prisma.$transaction([
      // New owner becomes the project's userId and an Owner member row.
      prisma.project.update({ where: { id: params.projectId }, data: { userId: target } }),
      prisma.projectMember.upsert({
        where: { userId_projectId: { userId: target, projectId: params.projectId } },
        update: { role: "Owner" },
        create: { projectId: params.projectId, userId: target, role: "Owner" },
      }),
      // Previous owner (the caller) is demoted to Admin.
      prisma.projectMember.upsert({
        where: { userId_projectId: { userId: project.userId, projectId: params.projectId } },
        update: { role: "Admin" },
        create: { projectId: params.projectId, userId: project.userId, role: "Admin" },
      }),
    ])
    return NextResponse.json({ success: true, transferred: true })
  }

  // Cannot change the creator's role except via transfer above.
  if (target === project.userId) {
    return NextResponse.json({ error: "Cannot change the project owner's role directly" }, { status: 400 })
  }

  // Build overrides update from any provided override keys.
  const overrideData: Record<string, boolean | null> = {}
  if (body.overrides && typeof body.overrides === "object") {
    for (const k of OVERRIDE_KEYS) {
      if (k in body.overrides) {
        const v = body.overrides[k]
        overrideData[k] = v === null ? null : Boolean(v)
      }
    }
  }

  const member = await prisma.projectMember.upsert({
    where: { userId_projectId: { userId: target, projectId: params.projectId } },
    update: { ...(newRole ? { role: newRole } : {}), ...overrideData },
    create: { projectId: params.projectId, userId: target, role: newRole ?? "Member", ...overrideData },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  })

  return NextResponse.json({ member })
}

// DELETE — remove a member from the project.
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireProjectPermission(params.projectId, "canManageMembers")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const callerRole = auth.resolved.role
  const callerId = auth.session.user.id
  const target = params.userId

  if (target === callerId) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { userId: true },
  })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  if (target === project.userId) {
    return NextResponse.json({ error: "The project owner cannot be removed" }, { status: 400 })
  }

  const currentTargetRole = await targetRole(params.projectId, target)
  if (!currentTargetRole) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  // Only an Owner may remove an Admin.
  if (currentTargetRole === "Admin" && callerRole !== "Owner") {
    return NextResponse.json({ error: "Only an Owner can remove an Admin" }, { status: 403 })
  }

  await prisma.projectMember.deleteMany({
    where: { projectId: params.projectId, userId: target },
  })

  return NextResponse.json({ success: true })
}
