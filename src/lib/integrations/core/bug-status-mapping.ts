/**
 * How this app's bug statuses correspond to the connected tracker's statuses.
 *
 * The mapping is a per-project SETTING, not a rule in the code. Trackers name
 * their statuses whatever they like — in whatever language — and no two projects
 * agree, so anything decided here would be wrong for someone. The app stores
 * what the user chose (ProjectIntegration.statusMapping.bug) and uses that.
 *
 * `suggestBugStatusMapping` exists only to pre-fill the form on first use so the
 * common English setups aren't typed out by hand. Its guesses are shown to the
 * user, can be changed row by row, and are never applied on their own.
 */
import type { WorkItemStatus } from "./types"

/** The app's own bug vocabulary (the BugStatus enum), in workflow order. */
export const APP_BUG_STATUSES = [
  "Open",
  "InProgress",
  "ReadyForRetest",
  "Reopened",
  "Resolved",
  "Closed",
  "Rejected",
  "Duplicate",
] as const

export type AppBugStatus = (typeof APP_BUG_STATUSES)[number]

/** Human label for an app bug status, for form rows and messages. */
export const APP_BUG_STATUS_LABELS: Record<AppBugStatus, string> = {
  Open: "Open",
  InProgress: "In Progress",
  ReadyForRetest: "Ready for Retest",
  Reopened: "Reopened",
  Resolved: "Resolved",
  Closed: "Closed",
  Rejected: "Rejected",
  Duplicate: "Duplicate",
}

/** app bug status → tracker status id. Absent keys mean "not mapped". */
export type BugStatusMapping = Partial<Record<AppBugStatus, string>>

/**
 * First-guess names for each app status, used ONLY to pre-fill the mapping form.
 * English-only and deliberately so: it is a convenience for the common case, and
 * every row it fills in is editable. A tracker whose statuses are named in
 * another language simply starts with an empty form instead of a wrong one.
 */
const SUGGESTION_HINTS: Record<AppBugStatus, string[]> = {
  Open: ["new", "open", "to do", "todo", "confirmed"],
  InProgress: ["in progress", "in development", "developing", "in dev"],
  ReadyForRetest: ["in testing", "ready for testing", "to be tested", "in review", "testing"],
  Reopened: ["reopened", "re-opened", "reopen"],
  Resolved: ["resolved", "fixed", "developed", "tested"],
  Closed: ["closed", "done", "complete", "completed"],
  Rejected: ["rejected", "invalid", "won't fix", "wont fix", "wontfix"],
  Duplicate: ["duplicate", "dupe"],
}

/**
 * Propose a mapping from the tracker's actual statuses. Exact name match first,
 * then a contains match, and never the same tracker status twice — two app
 * statuses pointing at one tracker status would make bug states indistinguishable
 * once synced.
 *
 * Returns only what it is reasonably sure of; unmatched app statuses are left
 * out for the user to fill in.
 */
export function suggestBugStatusMapping(
  trackerStatuses: Array<Pick<WorkItemStatus, "id" | "name">>
): BugStatusMapping {
  const taken = new Set<string>()
  const suggestion: BugStatusMapping = {}

  for (const appStatus of APP_BUG_STATUSES) {
    const hints = SUGGESTION_HINTS[appStatus]
    const available = trackerStatuses.filter((s) => !taken.has(String(s.id)))
    const norm = (s: { name: string }) => s.name.trim().toLowerCase()

    const match =
      available.find((s) => hints.includes(norm(s))) ||
      available.find((s) => hints.some((h) => norm(s).includes(h)))

    if (match) {
      taken.add(String(match.id))
      suggestion[appStatus] = String(match.id)
    }
  }

  return suggestion
}

/** Read a stored mapping off the integration's statusMapping JSON, safely. */
export function readBugStatusMapping(statusMapping: unknown): BugStatusMapping {
  const bug = (statusMapping as { bug?: unknown } | null | undefined)?.bug
  if (!bug || typeof bug !== "object") return {}

  const out: BugStatusMapping = {}
  for (const appStatus of APP_BUG_STATUSES) {
    const value = (bug as Record<string, unknown>)[appStatus]
    if (typeof value === "string" && value.trim()) out[appStatus] = value.trim()
  }
  return out
}

/**
 * The tracker status id for a bug's current app status, or null when the user
 * has not mapped it. Null means "leave the tracker's status alone" — guessing
 * here is what would move a work package somewhere nobody asked for.
 */
export function trackerStatusIdFor(
  mapping: BugStatusMapping,
  appStatus: string | null | undefined
): string | null {
  if (!appStatus) return null
  return mapping[appStatus as AppBugStatus] ?? null
}

/**
 * The reverse: which app bug status a tracker status means, or null when the
 * user has not mapped that tracker status to anything.
 *
 * Null is a real answer, not a failure. A tracker workflow routinely holds
 * states the app has no word for — "Specified", "To be scheduled", "Developed" —
 * and inventing a local status for them would be a lie that then syncs back out.
 * Callers keep the local status as-is and rely on the mirrored board, which
 * groups by the tracker's own status, to show where the bug really is.
 *
 * The PUT handler that saves the mapping rejects two app statuses sharing one
 * tracker status, so this lookup is unambiguous by construction.
 */
export function appStatusForTrackerStatus(
  mapping: BugStatusMapping,
  trackerStatusId: string | null | undefined
): AppBugStatus | null {
  if (!trackerStatusId) return null
  const target = String(trackerStatusId).trim()
  for (const appStatus of APP_BUG_STATUSES) {
    if (mapping[appStatus] === target) return appStatus
  }
  return null
}
