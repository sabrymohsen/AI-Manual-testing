// Project-creation limits by plan. A Global Admin (User.role === "Admin") is
// always unlimited regardless of plan. "Owned" projects = projects where the
// user is the creator / Owner.
//
// Counts the number of projects a user may OWN. Number.POSITIVE_INFINITY = no limit.

export const PROJECT_LIMITS: Record<string, number> = {
  Free: 3,
  Pro: Number.POSITIVE_INFINITY,
}

/** Effective owned-project limit for a user, given plan + global role. */
export function getProjectLimit(plan: string | null | undefined, role: string | null | undefined): number {
  if (role === "Admin") return Number.POSITIVE_INFINITY
  return PROJECT_LIMITS[plan ?? "Free"] ?? PROJECT_LIMITS.Free
}

/** Whether `owned` is under the limit (i.e. the user can create another). */
export function canCreateAnother(owned: number, limit: number): boolean {
  return owned < limit
}
