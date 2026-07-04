/**
 * Requirement coverage computation — the single source of truth.
 *
 * Derives a requirement's coverage status from its linked test cases' most
 * recent execution (automated run or manual session, whichever is newer) and
 * its linked bugs. Previously duplicated across four API routes:
 * requirements list, single requirement, coverage-matrix, coverage-summary.
 *
 * Rules:
 * - No linked test cases → "Uncovered" (regardless of bugs).
 * - A Critical/High linked bug, or any Blocked latest execution → "Blocked".
 * - Any Failed latest execution → "Failed".
 * - Some executed + some not → "PartiallyCovered"; none executed → "NotExecuted".
 * - All executed and passing → "Covered".
 */

type ExecutionLike = {
  completedAt: Date | string | null
  status: string
}

export interface CoverageTestCaseLink {
  testCase?: {
    testRuns?: ExecutionLike[] | null
    manualSessionCases?: ExecutionLike[] | null
  } | null
}

export interface CoverageBugLink {
  bugReport: { severity: string }
}

export type RequirementCoverageStatus =
  | "Uncovered"
  | "Covered"
  | "PartiallyCovered"
  | "Failed"
  | "Blocked"
  | "NotExecuted"

export interface RequirementCoverage {
  status: RequirementCoverageStatus
  /** A linked test case's latest execution failed (used for risk scoring). */
  hasFailed: boolean
  /** A linked bug has Critical/High severity (used for risk scoring). */
  hasCriticalBugs: boolean
}

export function computeRequirementCoverage(
  links: CoverageTestCaseLink[],
  bugs: CoverageBugLink[]
): RequirementCoverage {
  let hasFailed = false
  let hasBlocked = false
  let hasWarning = false
  let hasNotExecuted = false
  let hasPassed = false

  const hasCriticalBugs = bugs.some(
    (b) => b.bugReport.severity === "Critical" || b.bugReport.severity === "High"
  )
  if (hasCriticalBugs) {
    hasBlocked = true
  }

  let status: RequirementCoverageStatus = "Uncovered"

  if (links.length > 0) {
    links.forEach((link) => {
      const tc = link.testCase
      if (!tc) return

      const latestRun = tc.testRuns?.[0] || null
      const latestManualCase = tc.manualSessionCases?.[0] || null

      let latestStatus = "NotExecuted"
      let latestTime = 0

      if (latestRun && latestRun.completedAt) {
        latestTime = new Date(latestRun.completedAt).getTime()
        latestStatus = latestRun.status
      }

      if (latestManualCase && latestManualCase.completedAt) {
        const mTime = new Date(latestManualCase.completedAt).getTime()
        if (mTime > latestTime) {
          latestTime = mTime
          latestStatus = latestManualCase.status
        }
      }

      if (
        latestStatus === "NotExecuted" ||
        latestStatus === "Pending" ||
        latestStatus === "Queued" ||
        latestStatus === "Running"
      ) {
        hasNotExecuted = true
      } else if (latestStatus === "Failed") {
        hasFailed = true
      } else if (latestStatus === "Blocked") {
        hasBlocked = true
      } else if (latestStatus === "Warning") {
        hasWarning = true
      } else if (latestStatus === "Passed") {
        hasPassed = true
      }
    })

    if (hasBlocked) {
      status = "Blocked"
    } else if (hasFailed) {
      status = "Failed"
    } else if (hasNotExecuted) {
      status = hasPassed || hasFailed || hasWarning ? "PartiallyCovered" : "NotExecuted"
    } else if (hasPassed) {
      status = "Covered"
    } else {
      status = "NotExecuted"
    }
  }

  return { status, hasFailed, hasCriticalBugs }
}
