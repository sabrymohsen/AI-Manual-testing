import { prisma } from "@/lib/db"

/**
 * Turn a stored assignee value into a person's name.
 *
 * `BugReport.assignedTo` holds the TRACKER's own user id (e.g. "62"), not a
 * name: it is sent straight to Jira/Azure/OpenProject as the assignee, and
 * storing anything friendlier there would leave the synced work package
 * unassigned. That is right for syncing and useless for reading — a report that
 * says a defect belongs to "62" tells the reader nothing.
 *
 * The names live in ProjectTeamMember, the project's assignee pool.
 */

/**
 * Map every identifier a bug might carry to the member's display name.
 *
 * Keyed three ways because `assignedTo` has been written from different places
 * over time: the tracker's user id (what the dropdown sends today), the pool
 * row's own id (manual members with no tracker account), and an email address
 * (older bugs, and the free-text fallback shown when the pool is empty).
 */
export async function buildAssigneeNameMap(projectId: string): Promise<Map<string, string>> {
  const members = await prisma.projectTeamMember.findMany({
    where: { projectId },
    select: { id: true, externalId: true, name: true, email: true }
  })

  const map = new Map<string, string>()
  for (const m of members) {
    if (!m.name) continue
    if (m.externalId) map.set(m.externalId, m.name)
    map.set(m.id, m.name)
    if (m.email) map.set(m.email.toLowerCase(), m.name)
  }
  return map
}

/**
 * The name to show for a stored assignee value.
 *
 * An unknown value is returned as-is rather than blanked: a member removed from
 * the pool still leaves bugs behind, and showing the raw id at least says the
 * defect is assigned to *someone*. Empty stays empty so callers can render
 * their own "Unassigned".
 */
export function assigneeName(value: string | null | undefined, names: Map<string, string>): string {
  if (!value) return ""
  return names.get(value) ?? names.get(value.toLowerCase()) ?? value
}
