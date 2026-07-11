import { create } from "zustand"
import {
  PROJECT_PERMISSIONS,
  normalizeRole,
  type ProjectPermission,
  type ProjectRole,
  type GlobalRole,
} from "@/lib/permissions"

interface PermissionState {
  globalRole: GlobalRole | null
  projectRole: ProjectRole | null
  projectId: string | null
  // Flat resolved permission map from the server (already accounts for
  // overrides + global admin). When empty we fall back to role defaults.
  permissions: Partial<Record<ProjectPermission, boolean>>
  isLoading: boolean

  setPermissions: (data: {
    globalRole: string
    projectRole: string
    projectId?: string | null
    permissions?: Partial<Record<ProjectPermission, boolean>>
  }) => void
  reset: () => void

  can: (permission: ProjectPermission) => boolean
  isAdmin: () => boolean
  isOwner: () => boolean
  canManageProject: () => boolean
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  globalRole: null,
  projectRole: null,
  projectId: null,
  permissions: {},
  isLoading: true,

  setPermissions: ({ globalRole, projectRole, projectId = null, permissions = {} }) =>
    set({
      globalRole: (globalRole as GlobalRole) ?? "User",
      projectRole: normalizeRole(projectRole),
      projectId,
      permissions,
      isLoading: false,
    }),

  reset: () =>
    set({ globalRole: null, projectRole: null, projectId: null, permissions: {}, isLoading: true }),

  can: (permission) => {
    const { projectRole, permissions, globalRole } = get()
    // Global Admin can do everything, everywhere.
    if (globalRole === "Admin") return true
    // Prefer the server-resolved permission map (includes overrides).
    if (permissions[permission] !== undefined) return permissions[permission] as boolean
    // Fall back to role defaults.
    const rolePerms = PROJECT_PERMISSIONS[projectRole ?? "Member"]
    return rolePerms[permission] ?? false
  },

  isAdmin: () => {
    const { globalRole, projectRole } = get()
    return globalRole === "Admin" || projectRole === "Owner" || projectRole === "Admin"
  },

  isOwner: () => {
    const { globalRole, projectRole } = get()
    return globalRole === "Admin" || projectRole === "Owner"
  },

  canManageProject: () => {
    const { projectRole, globalRole } = get()
    return globalRole === "Admin" || projectRole === "Owner" || projectRole === "Admin"
  },
}))
