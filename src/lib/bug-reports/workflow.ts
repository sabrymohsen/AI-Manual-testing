/**
 * Bug status workflow.
 *
 * `PUT /api/bug-reports/[bugId]` previously wrote `status as any` with no
 * checks, so any status could jump to any other — Closed straight back to
 * InProgress, Open to Closed skipping retest — and `resolution` was optional
 * everywhere, so bugs reached Closed with no recorded reason. That makes "why
 * was this closed?" unanswerable and any future fix-rate reporting meaningless.
 *
 * Kept as pure functions so the rules can be tested without a database.
 */

export const BUG_STATUSES = [
  "Open",
  "InProgress",
  "ReadyForRetest",
  "Reopened",
  "Resolved",
  "Closed",
  "Rejected",
  "Duplicate",
] as const

export type BugStatusValue = (typeof BUG_STATUSES)[number]

export const BUG_RESOLUTIONS = [
  "Fixed",
  "WontFix",
  "CannotReproduce",
  "Duplicate",
  "ByDesign",
] as const

export type BugResolutionValue = (typeof BUG_RESOLUTIONS)[number]

/**
 * Legal next states. Modelled on the real QA loop:
 *
 *   Open → InProgress → ReadyForRetest → Closed
 *                            ↓
 *                        Reopened → InProgress
 *
 * Closed is not a dead end — a bug can always be Reopened, which is how
 * regressions get tracked. Rejected and Duplicate can be undone back to Open,
 * because triage mistakes happen.
 */
export const ALLOWED_TRANSITIONS: Record<BugStatusValue, BugStatusValue[]> = {
  Open: ["InProgress", "Resolved", "Rejected", "Duplicate"],
  InProgress: ["Open", "ReadyForRetest", "Resolved", "Rejected", "Duplicate"],
  ReadyForRetest: ["Closed", "Reopened", "InProgress"],
  Reopened: ["InProgress", "ReadyForRetest", "Resolved", "Rejected", "Duplicate"],
  Resolved: ["ReadyForRetest", "Closed", "Reopened"],
  Closed: ["Reopened"],
  Rejected: ["Open", "Reopened"],
  Duplicate: ["Open", "Reopened"],
}

/** Statuses that must record WHY the bug ended up there. */
export const RESOLUTION_REQUIRED_STATUSES: BugStatusValue[] = ["Resolved", "Closed", "Rejected"]

/** Entering Duplicate has exactly one meaningful resolution, so don't ask. */
export const IMPLIED_RESOLUTION: Partial<Record<BugStatusValue, BugResolutionValue>> = {
  Duplicate: "Duplicate",
}

export function isBugStatus(value: unknown): value is BugStatusValue {
  return typeof value === "string" && (BUG_STATUSES as readonly string[]).includes(value)
}

export function isBugResolution(value: unknown): value is BugResolutionValue {
  return typeof value === "string" && (BUG_RESOLUTIONS as readonly string[]).includes(value)
}

/** Statuses a bug can be reopened *from* — i.e. it had been settled. */
export const SETTLED_STATUSES: BugStatusValue[] = ["Resolved", "Closed", "Rejected", "Duplicate"]

/**
 * True when this transition represents a genuine reopen: the bug had been
 * settled and is being pulled back into play.
 *
 * Deliberately not "target === Reopened" alone — moving Open → Reopened isn't a
 * reopen, and counting it would inflate the regression signal.
 */
export function isReopen(from: string, to: BugStatusValue): boolean {
  return to === "Reopened" && SETTLED_STATUSES.includes(from as BugStatusValue)
}

export type TransitionCheck =
  | { ok: true; resolution: BugResolutionValue | null | undefined; isReopen: boolean }
  | { ok: false; code: "INVALID_STATUS" | "INVALID_TRANSITION" | "RESOLUTION_REQUIRED" | "INVALID_RESOLUTION"; error: string }

/**
 * Validates a status change.
 *
 * @param from        current status
 * @param to          requested status
 * @param resolution  supplied resolution, if any
 * @param existingResolution  resolution already on the bug — a bug that already
 *                            has one doesn't need it supplied again
 */
export function checkTransition(
  from: string,
  to: unknown,
  resolution: unknown,
  existingResolution?: string | null
): TransitionCheck {
  if (!isBugStatus(to)) {
    return { ok: false, code: "INVALID_STATUS", error: `"${String(to)}" is not a valid bug status` }
  }

  // A no-op is always fine — the UI sends the full object on unrelated edits.
  if (from === to) {
    return { ok: true, resolution: resolution as BugResolutionValue | undefined, isReopen: false }
  }

  if (!isBugStatus(from)) {
    return { ok: false, code: "INVALID_STATUS", error: `"${from}" is not a valid bug status` }
  }

  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: `Can't move a bug from ${from} to ${to}. Allowed from ${from}: ${ALLOWED_TRANSITIONS[from].join(", ")}.`,
    }
  }

  if (resolution !== undefined && resolution !== null && !isBugResolution(resolution)) {
    return { ok: false, code: "INVALID_RESOLUTION", error: `"${String(resolution)}" is not a valid resolution` }
  }

  const reopened = isReopen(from, to)

  const implied = IMPLIED_RESOLUTION[to]
  if (implied) return { ok: true, resolution: implied, isReopen: reopened }

  if (RESOLUTION_REQUIRED_STATUSES.includes(to)) {
    const effective = (resolution as BugResolutionValue | undefined) ?? existingResolution
    if (!effective) {
      return {
        ok: false,
        code: "RESOLUTION_REQUIRED",
        error: `Moving a bug to ${to} needs a resolution (${BUG_RESOLUTIONS.join(", ")}).`,
      }
    }
    return { ok: true, resolution: effective as BugResolutionValue, isReopen: reopened }
  }

  // Leaving a terminal state clears the stale resolution — a Reopened bug that
  // still reads "Fixed" is worse than one with no resolution at all.
  if (to === "Reopened" || to === "Open" || to === "InProgress") {
    return { ok: true, resolution: null, isReopen: reopened }
  }

  return { ok: true, resolution: resolution as BugResolutionValue | undefined, isReopen: reopened }
}
