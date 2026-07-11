import { usePermissionStore } from "@/stores/permissionStore"
import type { ProjectPermission } from "@/lib/permissions"

/**
 * Convenience hook over the permission store. Subscribes to the store so
 * components re-render when the active project's permissions change.
 */
export function usePermission() {
  const globalRole = usePermissionStore((s) => s.globalRole)
  const projectRole = usePermissionStore((s) => s.projectRole)
  const permissions = usePermissionStore((s) => s.permissions)
  const isLoading = usePermissionStore((s) => s.isLoading)

  const store = usePermissionStore

  return {
    globalRole,
    projectRole,
    isLoading,
    can: (permission: ProjectPermission) => store.getState().can(permission),
    isAdmin: () => store.getState().isAdmin(),
    isOwner: () => store.getState().isOwner(),
    canManageProject: () => store.getState().canManageProject(),
    // expose raw map for debugging / conditional logic
    permissions,
  }
}
