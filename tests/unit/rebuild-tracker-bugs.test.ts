/**
 * The rebuild deletes tracker work items permanently, so the classification that
 * decides "this one already exists in the app" vs "this one only exists here and
 * must be imported first" is the step that determines whether anything is lost.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { classifyTrackerBug, isBugWorkItem, bugMarker } from "@/lib/integrations/core/rebuild-bugs"

const LOCAL_ID = "6f1c9b3a-1111-4a2b-8c3d-000000000001"

function item(externalId: string, description = "") {
  return { externalId, description }
}

describe("classifyTrackerBug", () => {
  it("deletes a work item the app already has a mapping for", () => {
    const result = classifyTrackerBug(item("101"), new Set(["101"]), new Set())

    expect(result.action).toBe("delete")
  })

  it("deletes a work item whose marker names a bug that still exists", () => {
    const description = `Some text\n<!-- ${bugMarker(LOCAL_ID)} -->`
    const result = classifyTrackerBug(item("102", description), new Set(), new Set([LOCAL_ID]))

    expect(result).toEqual({ action: "delete", localBugId: LOCAL_ID })
  })

  it("imports a work item nobody in the app knows about", () => {
    const result = classifyTrackerBug(item("103", "Filed straight in the tracker"), new Set(), new Set())

    expect(result.action).toBe("import-then-delete")
  })

  it("imports rather than drops a work item whose local bug was deleted", () => {
    // The marker points at a bug that no longer exists here, so the work item is
    // the only remaining copy — deleting it outright would lose it.
    const description = `<!-- ${bugMarker(LOCAL_ID)} -->`
    const result = classifyTrackerBug(item("104", description), new Set(), new Set())

    expect(result.action).toBe("import-then-delete")
  })

  it("treats a mapping as authoritative even without a marker in the description", () => {
    const result = classifyTrackerBug(item("105", "description was rewritten by a user"), new Set(["105"]), new Set())

    expect(result.action).toBe("delete")
  })

  it("does not match a partial or malformed marker", () => {
    const result = classifyTrackerBug(
      item("106", "AI-Manual-QA-Tester:BugReport:not-a-uuid"),
      new Set(),
      new Set([LOCAL_ID])
    )

    expect(result.action).toBe("import-then-delete")
  })
})

describe("isBugWorkItem", () => {
  it("accepts an item of the project's bug type", () => {
    expect(isBugWorkItem({ typeId: "7" }, "7")).toBe(true)
  })

  it("rejects tasks, features and anything else that is not the bug type", () => {
    expect(isBugWorkItem({ typeId: "1" }, "7")).toBe(false)
  })

  it("rejects everything when the bug type could not be determined", () => {
    // The alternative — treating an unknown type as "probably a bug" — would
    // queue a project's entire backlog for deletion.
    expect(isBugWorkItem({ typeId: "7" }, null)).toBe(false)
  })

  it("rejects an item with no type at all", () => {
    expect(isBugWorkItem({ typeId: null }, "7")).toBe(false)
  })

  it("compares ids as strings, since providers return them both ways", () => {
    expect(isBugWorkItem({ typeId: 7 as unknown as string }, "7")).toBe(true)
  })
})
