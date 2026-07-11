import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, requireProjectPermission } from "@/lib/api-guards"
import { normalizeRole, PROJECT_ROLES, OVERRIDE_KEYS } from "@/lib/permissions"
import { notify } from "@/lib/notifications"
import { logUserActivity } from "@/lib/user-activity"

// GET /api/projects/[projectId]/members — list all project members.
// Any project member can view the roster. The project creator is always
// surfaced as an Owner even if no ProjectMember row exists for them.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      projectMembers: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const seen = new Set<string>()
  const members = project.projectMembers.map((m) => {
    seen.add(m.userId)
    const overrides: Record<string, boolean | null> = {}
    const row = m as unknown as Record<string, boolean | null>
    for (const k of OVERRIDE_KEYS) overrides[k] = row[k]
    return {
      id: m.id,
      userId: m.userId,
      role: m.userId === project.userId ? "Owner" : normalizeRole(m.role),
      isCreator: m.userId === project.userId,
      joinedAt: m.createdAt,
      user: m.user,
      overrides,
    }
  })

  // Ensure the creator appears even without a ProjectMember row.
  if (!seen.has(project.userId) && project.user) {
    members.unshift({
      id: `creator:${project.userId}`,
      userId: project.userId,
      role: "Owner",
      isCreator: true,
      joinedAt: null as any,
      user: project.user,
      overrides: {},
    })
  }

  // Owner first, then Admin, Member, Viewer.
  const rank: Record<string, number> = { Owner: 0, Admin: 1, Member: 2, Viewer: 3 }
  members.sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9))

  return NextResponse.json({ members })
}

// POST /api/projects/[projectId]/members — add an existing user directly, or
// create a token invitation for a not-yet-registered email. Requires
// canInviteMembers.
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canInviteMembers")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const emailOrUsername: string = (body.email ?? body.username ?? "").trim()
  const role = PROJECT_ROLES.includes(body.role) ? body.role : "Member"
  if (!emailOrUsername) {
    return NextResponse.json({ error: "Email or username is required" }, { status: 400 })
  }
  // Only Owners may grant the Owner role directly.
  if (role === "Owner" && auth.resolved.role !== "Owner") {
    return NextResponse.json({ error: "Only an Owner can assign the Owner role" }, { status: 403 })
  }

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { userId: true, name: true },
  })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  // Look the user up by exact email or name.
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: emailOrUsername, mode: "insensitive" } },
        { name: { equals: emailOrUsername, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })

  if (user) {
    if (user.id === project.userId) {
      return NextResponse.json({ error: "That user is the project owner" }, { status: 409 })
    }
    const existing = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId: params.projectId } },
    })
    if (existing) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 })
    }
    const member = await prisma.projectMember.create({
      data: { projectId: params.projectId, userId: user.id, role },
    })

    const inviterName = auth.session.user.name || auth.session.user.email
    notify({
      userId: user.id,
      type: "INVITATION",
      title: `You've been added to ${project.name}`,
      body: `${inviterName} added you as ${role}`,
      projectId: params.projectId,
      actionUrl: `/projects/${params.projectId}/scrum`,
    }).catch(() => {})
    logUserActivity(user.id, "PROJECT_JOINED", `Joined project "${project.name}"`, params.projectId)

    return NextResponse.json({ type: "added", member: { ...member, user } }, { status: 201 })
  }

  // No account yet → create a token invitation and return a shareable link.
  const email = emailOrUsername
  const token = globalThis.crypto.randomUUID().replace(/-/g, "")
  const invitation = await prisma.invitation.create({
    data: {
      email,
      projectId: params.projectId,
      invitedById: auth.session.user.id,
      role,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  const origin = new URL(request.url).origin
  return NextResponse.json(
    {
      type: "invitation",
      invitation,
      inviteUrl: `${origin}/invite/${token}`,
    },
    { status: 201 }
  )
}
