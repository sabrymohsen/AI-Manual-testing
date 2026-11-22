import { describe, it, expect } from "vitest"
import { formatBugKey, maxKeyNumber } from "@/lib/bug-reports/keys"

describe("bug keys", () => {
  it("formats BUG-0001 style keys", () => {
    expect(formatBugKey(1)).toBe("BUG-0001")
    expect(formatBugKey(12)).toBe("BUG-0012")
    expect(formatBugKey(12345)).toBe("BUG-12345")
  })

  it("continues from the highest key, not the count (no repeat after a delete)", () => {
    // 5 bugs were filed, BUG-0003 deleted: 4 remain, but the next must be BUG-0006.
    const keys = ["BUG-0001", "BUG-0002", "BUG-0004", "BUG-0005"]
    expect(maxKeyNumber(keys) + 1).toBe(6)
  })

  it("ignores missing and foreign keys", () => {
    expect(maxKeyNumber([null, undefined, "", "OP-77", "bug-0009", "BUG-x"])).toBe(9)
    expect(maxKeyNumber([])).toBe(0)
  })
})
