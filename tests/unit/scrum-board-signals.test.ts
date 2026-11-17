import { describe, it, expect } from "vitest"
import { summarizeSignals } from "@/lib/scrum/board-signals"

describe("board signals", () => {
  it("blocked only while a blocker is unfinished", () => {
    expect(summarizeSignals({ blockerStatuses: ["IN_PROGRESS"], testStatuses: [] }).blocked).toBe(true)
    expect(summarizeSignals({ blockerStatuses: ["DONE", "DEPLOYED"], testStatuses: [] }).blocked).toBe(false)
    expect(summarizeSignals({ blockerStatuses: [], testStatuses: [] }).blocked).toBe(false)
  })

  it("counts executed tests only", () => {
    expect(
      summarizeSignals({ blockerStatuses: [], testStatuses: ["Passed", "Passed", "Failed", "NotExecuted", "Skipped"] }).tests
    ).toEqual({ passed: 2, failed: 1, total: 3 })
    expect(summarizeSignals({ blockerStatuses: [], testStatuses: ["NotExecuted"] }).tests).toEqual({ passed: 0, failed: 0, total: 0 })
    expect(summarizeSignals({ blockerStatuses: [], testStatuses: ["Blocked", "Warning", "Passed"] }).tests).toEqual({ passed: 1, failed: 0, total: 3 })
  })
})
