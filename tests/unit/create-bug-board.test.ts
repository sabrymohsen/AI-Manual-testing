/**
 * Matching this app's bug statuses to the tracker's own. Getting it wrong builds
 * a board whose columns quietly hold the wrong cards — or two columns showing
 * the same ones.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { planBugBoardColumns } from "@/lib/integrations/openproject/create-bug-board"

const statuses = (...names: string[]) =>
  names.map((name, i) => ({ id: String(i + 1), name }))

describe("planBugBoardColumns", () => {
  it("matches a default OpenProject status set", () => {
    const plan = planBugBoardColumns(statuses("New", "In progress", "In testing", "Closed", "Rejected"))
    const byStatus = Object.fromEntries(plan.map((c) => [c.bugStatus, c.statusName]))

    expect(byStatus.Open).toBe("New")
    expect(byStatus.InProgress).toBe("In progress")
    expect(byStatus.ReadyForRetest).toBe("In testing")
    expect(byStatus.Closed).toBe("Closed")
    expect(byStatus.Rejected).toBe("Rejected")
  })

  it("keeps the columns in workflow order", () => {
    const plan = planBugBoardColumns(statuses("Closed", "New", "In progress"))

    expect(plan.map((c) => c.bugStatus)).toEqual([
      "Open", "InProgress", "ReadyForRetest", "Resolved", "Closed", "Rejected",
    ])
  })

  it("never backs two columns with the same tracker status", () => {
    // "Closed" contains-matches both Closed and (via no alias) nothing else, but
    // a single status must not end up filtering two columns — they would show
    // identical cards.
    const plan = planBugBoardColumns(statuses("Closed"))
    const used = plan.filter((c) => c.statusId).map((c) => c.statusId)

    expect(used).toEqual([...new Set(used)])
    expect(used).toHaveLength(1)
  })

  it("leaves a column unmatched rather than guessing", () => {
    const plan = planBugBoardColumns(statuses("New", "Closed"))

    expect(plan.find((c) => c.bugStatus === "ReadyForRetest")?.statusId).toBeNull()
    expect(plan.find((c) => c.bugStatus === "Open")?.statusName).toBe("New")
  })

  it("is case and whitespace tolerant", () => {
    const plan = planBugBoardColumns(statuses("  IN PROGRESS  "))

    expect(plan.find((c) => c.bugStatus === "InProgress")?.statusName).toBe("  IN PROGRESS  ")
  })

  it("prefers an exact name over a looser contains match", () => {
    // "Rejected" must win over "Rejected by customer" for the Rejected column.
    const plan = planBugBoardColumns(statuses("Rejected by customer", "Rejected"))

    expect(plan.find((c) => c.bugStatus === "Rejected")?.statusName).toBe("Rejected")
  })

  it("matches nothing when the tracker's statuses are unrelated", () => {
    const plan = planBugBoardColumns(statuses("Alpha", "Beta"))

    expect(plan.every((c) => c.statusId === null)).toBe(true)
  })
})
