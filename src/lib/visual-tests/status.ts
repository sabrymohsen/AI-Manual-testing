/**
 * Status arithmetic for visual runs. Pure, so the worker, the review routes and
 * the UI all agree on what "passed" means.
 */

export type ScreenStatus = "New" | "Passed" | "Unresolved" | "Accepted" | "Rejected" | "Error" | "Removed"
export type RunOutcome = "Passed" | "Unresolved" | "Failed"

export interface RunTally {
  total: number
  passed: number
  unresolved: number
  failed: number
  new: number
  removed: number
}

/** New and Accepted count as passed; Rejected and Error as failed; Removed is reported but judged separately. */
export function tallyScreens(statuses: ScreenStatus[]): RunTally {
  const t: RunTally = { total: 0, passed: 0, unresolved: 0, failed: 0, new: 0, removed: 0 }
  for (const s of statuses) {
    if (s === "Removed") {
      t.removed++
      continue
    }
    t.total++
    if (s === "Passed" || s === "Accepted") t.passed++
    else if (s === "New") {
      t.passed++
      t.new++
    } else if (s === "Unresolved") t.unresolved++
    else t.failed++
  }
  return t
}

/**
 * A run fails when anything failed, is unresolved while anything waits for a
 * person, and passes otherwise. A removed page keeps a run Unresolved: someone
 * should confirm the page was meant to go, but it is not a defect by itself.
 * A run with nothing to judge has no outcome.
 */
export function runOutcome(t: RunTally): RunOutcome | null {
  if (t.total === 0 && t.removed === 0) return null
  if (t.failed > 0) return "Failed"
  if (t.unresolved > 0 || t.removed > 0) return "Unresolved"
  return "Passed"
}

/**
 * Screens a person can accept or reject. Passed has nothing to decide and Error
 * has no image to approve. A decision can be changed (Accepted → Rejected), and
 * a New screen can be rejected when its very first image is already wrong.
 */
export function isResolvable(status: ScreenStatus): boolean {
  return status === "Unresolved" || status === "Accepted" || status === "Rejected" || status === "New" || status === "Removed"
}
