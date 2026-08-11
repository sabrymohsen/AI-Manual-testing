"use client"

import { useProjectTeam } from "@/hooks/use-project-team"

/**
 * Assignee dropdown backed by the project's team pool (ProjectTeamMember).
 * `value` is a pool member id (stored on TestCase.assignee, which stays local).
 * The bug forms deliberately store the tracker's own user id instead, since
 * BugReport.assignedTo is sent to the tracker as the work item's assignee.
 * Shows active members; if the current value isn't in the pool it's still shown
 * so existing assignments never silently disappear.
 */
export function AssigneeSelect({
  projectId,
  value,
  onChange,
  className,
  disabled,
  allowUnassigned = true,
  id,
}: {
  projectId: string
  value: string | null | undefined
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  allowUnassigned?: boolean
  id?: string
}) {
  const { members, loading } = useProjectTeam(projectId)
  const active = members.filter((m) => m.active)
  const known = new Set(active.map((m) => m.id))
  const orphan = value && !known.has(value) ? value : null

  return (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      }
    >
      {allowUnassigned && <option value="">Unassigned</option>}
      {active.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.role ? ` — ${m.role}` : ""}
        </option>
      ))}
      {orphan && <option value={orphan}>{orphan} (not in team)</option>}
      {loading && active.length === 0 && <option value="" disabled>Loading team…</option>}
    </select>
  )
}
