// ─────────────────────────────────────────────────────────────────────────
// RBAC permission engine — the single source of truth for project-level
// capabilities. Used by BOTH the server (api-guards.ts) and the client
// (permissionStore.ts) so the two never drift.
//
// Roles are stored on ProjectMember.role as a String (legacy rows may be
// lowercase). The project creator (Project.userId) is treated as an implicit
// Owner, and a Global Admin (User.role === "Admin") gets every permission.
// ─────────────────────────────────────────────────────────────────────────

export type ProjectRole = "Owner" | "Admin" | "Member" | "Viewer";
export type GlobalRole = "Admin" | "Manager" | "User";

export const PROJECT_ROLES: ProjectRole[] = ["Owner", "Admin", "Member", "Viewer"];

export const PROJECT_PERMISSIONS = {
  Owner: {
    canCreateSprints: true,
    canDeleteSprints: true,
    canCreateEpics: true,
    canDeleteEpics: true,
    canCreateStories: true,
    canDeleteStories: true,
    canManageMembers: true,
    canInviteMembers: true,
    canDeleteProject: true,
    canEditBoard: true,
    canAccessReports: true,
    canAccessSettings: true,
    canAccessChat: true,
    canAccessMembers: true,
  },
  Admin: {
    canCreateSprints: true,
    canDeleteSprints: true,
    canCreateEpics: true,
    canDeleteEpics: true,
    canCreateStories: true,
    canDeleteStories: true,
    canManageMembers: true,
    canInviteMembers: true,
    canDeleteProject: false,
    canEditBoard: true,
    canAccessReports: true,
    canAccessSettings: true,
    canAccessChat: true,
    canAccessMembers: true,
  },
  Member: {
    canCreateSprints: false,
    canDeleteSprints: false,
    canCreateEpics: false,
    canDeleteEpics: false,
    canCreateStories: true,
    canDeleteStories: false,
    canManageMembers: false,
    canInviteMembers: false,
    canDeleteProject: false,
    canEditBoard: true,
    canAccessReports: true,
    canAccessSettings: false,
    canAccessChat: true,
    canAccessMembers: true,
  },
  Viewer: {
    canCreateSprints: false,
    canDeleteSprints: false,
    canCreateEpics: false,
    canDeleteEpics: false,
    canCreateStories: false,
    canDeleteStories: false,
    canManageMembers: false,
    canInviteMembers: false,
    canDeleteProject: false,
    canEditBoard: false,
    canAccessReports: true,
    canAccessSettings: false,
    canAccessChat: true,
    canAccessMembers: true,
  },
} as const;

export type ProjectPermission = keyof typeof PROJECT_PERMISSIONS.Owner;

export const ALL_PERMISSIONS = Object.keys(
  PROJECT_PERMISSIONS.Owner
) as ProjectPermission[];

// The per-member override columns on ProjectMember (all 14 permissions).
export const OVERRIDE_KEYS = [
  "canCreateSprints",
  "canDeleteSprints",
  "canCreateEpics",
  "canDeleteEpics",
  "canCreateStories",
  "canDeleteStories",
  "canManageMembers",
  "canInviteMembers",
  "canDeleteProject",
  "canEditBoard",
  "canAccessReports",
  "canAccessSettings",
  "canAccessChat",
  "canAccessMembers",
] as const;

export type OverrideKey = (typeof OVERRIDE_KEYS)[number];

/** Normalize a stored role string (any case, legacy values) into a ProjectRole. */
export function normalizeRole(role: string | null | undefined): ProjectRole {
  switch ((role ?? "").toLowerCase()) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "viewer":
      return "Viewer";
    case "member":
    case "manager": // legacy value maps to Member (a working, non-admin role)
    default:
      return "Member";
  }
}

/** Per-member overrides map (null/undefined = inherit from role). */
export type MemberOverrides = Partial<Record<OverrideKey, boolean | null>>;

export interface EffectiveContext {
  globalRole?: GlobalRole | string | null;
  projectRole?: ProjectRole | string | null;
  overrides?: MemberOverrides | null;
}

/**
 * Resolve the flat permission map for a member.
 * Precedence: Global Admin (all true) → explicit override → role default.
 */
export function resolveEffectivePermissions(
  ctx: EffectiveContext
): Record<ProjectPermission, boolean> {
  const isGlobalAdmin = (ctx.globalRole ?? "") === "Admin";
  const role = normalizeRole(ctx.projectRole as string);
  const roleDefaults = PROJECT_PERMISSIONS[role];
  const overrides = ctx.overrides ?? {};

  const result = {} as Record<ProjectPermission, boolean>;
  for (const perm of ALL_PERMISSIONS) {
    if (isGlobalAdmin) {
      result[perm] = true;
      continue;
    }
    const ov = (overrides as Record<string, boolean | null | undefined>)[perm];
    result[perm] = ov === true || ov === false ? ov : roleDefaults[perm];
  }
  return result;
}

/**
 * Single-permission check. `member` carries a role plus optional overrides,
 * mirroring a ProjectMember row (with an optional synthesized global flag).
 */
export function hasPermission(
  member:
    | (MemberOverrides & {
        role?: string | null;
        globalRole?: GlobalRole | string | null;
      })
    | null
    | undefined,
  permission: ProjectPermission
): boolean {
  if (!member) return false;
  return resolveEffectivePermissions({
    globalRole: member.globalRole,
    projectRole: member.role,
    overrides: member,
  })[permission];
}
