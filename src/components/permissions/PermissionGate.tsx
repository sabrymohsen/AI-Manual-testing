"use client"

import { ReactNode } from "react"
import { usePermissionStore } from "@/stores/permissionStore"
import type { ProjectPermission } from "@/lib/permissions"

/**
 * Renders children only when the current user holds `permission` in the active
 * project. Hidden (renders `fallback`, default null) otherwise. Buttons a user
 * can't use should be hidden entirely, not disabled.
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: ProjectPermission
  children: ReactNode
  fallback?: ReactNode
}) {
  const can = usePermissionStore((s) => s.can(permission))
  return <>{can ? children : fallback}</>
}

/** Global Admin OR project Owner/Admin. */
export function AdminGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const isAdmin = usePermissionStore((s) => s.isAdmin())
  return <>{isAdmin ? children : fallback}</>
}

/** Global Admin OR project Owner. */
export function OwnerGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const isOwner = usePermissionStore((s) => s.isOwner())
  return <>{isOwner ? children : fallback}</>
}

/** Can manage the project (Owner/Admin/Global Admin). */
export function ManageGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const canManage = usePermissionStore((s) => s.canManageProject())
  return <>{canManage ? children : fallback}</>
}

/** Global Admin only (platform superuser) — for the /admin link. */
export function GlobalAdminGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const globalRole = usePermissionStore((s) => s.globalRole)
  return <>{globalRole === "Admin" ? children : fallback}</>
}
