import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import {
  hasPermission,
  normalizeRole,
  resolveEffectivePermissions,
  OVERRIDE_KEYS,
  type ProjectPermission,
  type ProjectRole,
  type GlobalRole,
  type MemberOverrides,
} from "@/lib/permissions"
import { getProjectLimit } from "@/lib/plan-limits"

/**
 * Owner-level guard. Passes for the project creator, any ProjectMember whose
 * role is Owner or Admin (projects support multiple co-owners; Admin is an
 * Owner-equal role), and Global Admins.
 */
export async function requireProjectOwner(projectId: string): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }

  const resolved = await resolveProjectRole(projectId, session.user.id)
  const isOwnerLevel =
    !!resolved &&
    (resolved.globalRole === "Admin" || resolved.role === "Owner" || resolved.role === "Admin")

  if (!isOwnerLevel) {
    return { error: "Project not found or access denied", status: 404, session: null }
  }

  return { error: null, status: 200, session }
}

export async function requireProjectMember(projectId: string): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId: session.user.id },
        { projectMembers: { some: { userId: session.user.id } } }
      ]
    },
    select: { id: true }
  })

  if (!project) {
    return { error: "Project not found or access denied", status: 404, session: null }
  }

  return { error: null, status: 200, session }
}

export async function requireAuth(): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  return { error: null, status: 200, session }
}

// Gate for Pro-only features. Currently UNUSED — Live QA Session was made
// free for all users. Kept (with User.plan) so gating can be reintroduced
// without rebuilding the plumbing.
export async function requirePro(): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  })
  if (user?.plan !== "Pro") {
    return { error: "Pro plan required", status: 403, session: null }
  }
  return { error: null, status: 200, session }
}

export function unauthorizedResponse(error: string = "Not authenticated") {
  return NextResponse.json({ error }, { status: 401 })
}

export function forbiddenResponse(error: string = "Access denied") {
  return NextResponse.json({ error }, { status: 403 })
}

export function notFoundResponse(error: string = "Not found") {
  return NextResponse.json({ error }, { status: 404 })
}

export function badRequestResponse(error: string = "Bad request") {
  return NextResponse.json({ error }, { status: 400 })
}

export function serverErrorResponse(error: string = "Internal server error") {
  return NextResponse.json({ error }, { status: 500 })
}

export async function requireAdmin(): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!user || user.isActive === false) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  if (user.role !== "Admin") {
    return { error: "Admin access required", status: 403, session: null }
  }
  return { error: null, status: 200, session }
}

// ─────────────────────────────────────────────────────────────────────────
// RBAC — project role resolution + permission-aware guards.
//
// These EXTEND the guards above; they do not replace them. The creator of a
// project (Project.userId) is treated as an implicit Owner even without a
// ProjectMember row, and a Global Admin (User.role === "Admin") resolves to
// all-permissions everywhere.
// ─────────────────────────────────────────────────────────────────────────

export interface ResolvedProjectRole {
  role: ProjectRole | null // null => not a member of this project
  overrides: MemberOverrides
  isCreator: boolean
  globalRole: GlobalRole
  permissions: Record<ProjectPermission, boolean>
}

/**
 * Resolve a user's effective role + permissions for a project.
 * Returns role=null when the user is neither the creator, a ProjectMember,
 * nor a Global Admin.
 */
export async function resolveProjectRole(
  projectId: string,
  userId: string
): Promise<ResolvedProjectRole | null> {
  const [project, membership, dbUser] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    }),
    prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ])

  if (!project) return null

  const globalRole = (dbUser?.role ?? "User") as GlobalRole
  const isCreator = project.userId === userId

  const overrides: MemberOverrides = {}
  if (membership) {
    const m = membership as unknown as Record<string, boolean | null>
    for (const key of OVERRIDE_KEYS) {
      overrides[key] = m[key]
    }
  }

  let role: ProjectRole | null = null
  if (isCreator) role = "Owner"
  else if (membership) role = normalizeRole(membership.role)
  else if (globalRole === "Admin") role = "Admin" // global admin acting in a project they don't belong to

  // Not a member and not a global admin → no access.
  if (role === null && globalRole !== "Admin") return null

  const permissions = resolveEffectivePermissions({
    globalRole,
    projectRole: role ?? "Viewer",
    overrides,
  })

  return { role, overrides, isCreator, globalRole, permissions }
}

/**
 * Guard requiring a specific project permission. Mirrors the existing
 * {error, status, session} shape and additionally returns the resolved role.
 */
export async function requireProjectPermission(
  projectId: string,
  permission: ProjectPermission
): Promise<
  | { error: string; status: number; session: null; resolved: null }
  | {
      error: null
      status: 200
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>
      resolved: ResolvedProjectRole
    }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null, resolved: null }
  }
  const resolved = await resolveProjectRole(projectId, session.user.id)
  if (!resolved || resolved.role === null) {
    return { error: "Project not found or access denied", status: 404, session: null, resolved: null }
  }
  if (!resolved.permissions[permission]) {
    return { error: `Missing permission: ${permission}`, status: 403, session: null, resolved: null }
  }
  return { error: null, status: 200, session, resolved }
}

/**
 * Guard requiring at least a minimum project role (Owner > Admin > Member > Viewer).
 * Useful for member-management endpoints.
 */
export async function requireProjectRole(
  projectId: string,
  minRole: ProjectRole
): Promise<
  | { error: string; status: number; session: null; resolved: null }
  | {
      error: null
      status: 200
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>
      resolved: ResolvedProjectRole
    }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null, resolved: null }
  }
  const resolved = await resolveProjectRole(projectId, session.user.id)
  if (!resolved || resolved.role === null) {
    return { error: "Project not found or access denied", status: 404, session: null, resolved: null }
  }
  const rank: Record<ProjectRole, number> = { Owner: 3, Admin: 2, Member: 1, Viewer: 0 }
  if (rank[resolved.role] < rank[minRole]) {
    return { error: `${minRole} role or higher required`, status: 403, session: null, resolved: null }
  }
  return { error: null, status: 200, session, resolved }
}

/**
 * Guard for creating a new project. Every authenticated user may create
 * projects up to their plan's limit (Global Admin unlimited). Returns 403 with
 * an upgrade message when the owned-project limit is reached.
 */
export async function requireCanCreateProject(): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, plan: true, isActive: true },
  })
  if (!user || user.isActive === false) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  const limit = getProjectLimit(user.plan, user.role)
  if (limit !== Number.POSITIVE_INFINITY) {
    // Owned = projects the user created (Project.userId is the owner field).
    const owned = await prisma.project.count({ where: { userId: session.user.id } })
    if (owned >= limit) {
      return {
        error: `Project limit reached (${limit}). Upgrade your plan to create more.`,
        status: 403,
        session: null,
      }
    }
  }
  return { error: null, status: 200, session }
}

// Re-export for convenience so route handlers can import from one place.
export { hasPermission }
