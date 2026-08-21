/**
 * Where a bug board's columns come from, and how this app's bug statuses are
 * matched to the tracker's own.
 *
 * The columns are the TRACKER's statuses, not a list decided by this app. A
 * status with no column is a status a bug can reach and then vanish from the
 * board, so "every status by default" is the property that matters most here.
 */
import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { planBugBoardColumns } from "@/lib/integrations/core/create-bug-board"
import {
  suggestBugStatusMapping,
  readBugStatusMapping,
  trackerStatusIdFor,
} from "@/lib/integrations/core/bug-status-mapping"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

const statuses = (...names: string[]) =>
  names.map((name, i) => ({ id: String(i + 1), name }))

describe("planBugBoardColumns", () => {
  it("makes a column for every tracker status by default", () => {
    // The old behaviour capped this at six columns from a hardcoded list, so a
    // status like "On hold" got none and its bugs dropped off the board.
    const plan = planBugBoardColumns(
      statuses("New", "Confirmed", "In progress", "Developed", "In testing", "Tested", "Test failed", "Closed", "On hold", "Rejected")
    )

    expect(plan).toHaveLength(10)
    expect(plan.every((c) => c.selected)).toBe(true)
    expect(plan.map((c) => c.name)).toContain("On hold")
    expect(plan.map((c) => c.name)).toContain("Test failed")
  })

  it("names the columns after the tracker's own statuses", () => {
    // Not translated, not normalised — a tracker in any language reads correctly.
    const plan = planBugBoardColumns(statuses("قيد التنفيذ", "مغلق"))

    expect(plan.map((c) => c.name)).toEqual(["قيد التنفيذ", "مغلق"])
  })

  it("keeps the tracker's own status order", () => {
    const plan = planBugBoardColumns(statuses("Closed", "New", "In progress"))

    expect(plan.map((c) => c.name)).toEqual(["Closed", "New", "In progress"])
  })

  it("selects only the statuses the user picked", () => {
    const plan = planBugBoardColumns(statuses("New", "In progress", "Closed"), {
      selectedStatusIds: ["1", "3"],
    })

    expect(plan.filter((c) => c.selected).map((c) => c.name)).toEqual(["New", "Closed"])
    expect(plan.find((c) => c.name === "In progress")?.selected).toBe(false)
  })

  it("selects nothing when given an empty selection, rather than falling back to all", () => {
    // An empty list is a real choice; treating it as "all" would ignore the user.
    const plan = planBugBoardColumns(statuses("New", "Closed"), { selectedStatusIds: [] })

    expect(plan.every((c) => !c.selected)).toBe(true)
  })
})

describe("suggestBugStatusMapping", () => {
  it("proposes a mapping for a common English status set", () => {
    const s = suggestBugStatusMapping(statuses("New", "In progress", "In testing", "Closed", "Rejected"))

    expect(s.Open).toBe("1")
    expect(s.InProgress).toBe("2")
    expect(s.ReadyForRetest).toBe("3")
    expect(s.Closed).toBe("4")
    expect(s.Rejected).toBe("5")
  })

  it("never proposes one tracker status for two app statuses", () => {
    const s = suggestBugStatusMapping(statuses("Closed"))
    const used = Object.values(s)

    expect(used).toEqual([...new Set(used)])
  })

  it("prefers an exact name over a looser contains match", () => {
    const s = suggestBugStatusMapping(statuses("Rejected by customer", "Rejected"))

    expect(s.Rejected).toBe("2")
  })

  it("is case and whitespace tolerant", () => {
    const s = suggestBugStatusMapping(statuses("  IN PROGRESS  "))

    expect(s.InProgress).toBe("1")
  })

  it("suggests nothing it is not sure of, rather than guessing", () => {
    // A tracker whose statuses this app cannot recognise starts empty, so the
    // user fills the form in instead of inheriting a wrong mapping.
    const s = suggestBugStatusMapping(statuses("Alpha", "Beta"))

    expect(Object.keys(s)).toHaveLength(0)
  })
})

describe("stored bug status mapping", () => {
  it("reads only known app statuses and ignores junk", () => {
    const m = readBugStatusMapping({ bug: { Open: "7", NotAStatus: "9", Closed: "" } })

    expect(m).toEqual({ Open: "7" })
  })

  it("survives a missing or malformed statusMapping", () => {
    expect(readBugStatusMapping(null)).toEqual({})
    expect(readBugStatusMapping({})).toEqual({})
    expect(readBugStatusMapping({ bug: "nope" })).toEqual({})
  })

  it("returns null for an unmapped status so sync leaves the tracker alone", () => {
    // Guessing here would move a work item to a status nobody chose.
    expect(trackerStatusIdFor({ Open: "7" }, "Resolved")).toBeNull()
    expect(trackerStatusIdFor({ Open: "7" }, "Open")).toBe("7")
    expect(trackerStatusIdFor({}, null)).toBeNull()
  })
})

describe("board column queries", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("filters each column by BOTH status and the bug type", async () => {
    // Status alone shows every work package in that state — tasks and features
    // included — which is not a bug board.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 900 }),
      text: async () => "{}",
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const client = new OpenProjectClient("https://op.example.com", "demo", "token")
    await client.createBoardColumnQuery("Open", "7", "12")

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const hrefs = body.filters.map((f: any) => f._links.filter.href)
    expect(hrefs).toEqual(["/api/v3/queries/filters/status", "/api/v3/queries/filters/type"])
    expect(body.filters[1]._links.values[0].href).toBe("/api/v3/types/12")
  })

  it("sends the board name as a top-level attribute", async () => {
    // OpenProject answers "Name can't be blank" when it only appears in options.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 55 }),
      text: async () => "{}",
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const client = new OpenProjectClient("https://op.example.com", "demo", "token")
    await client.createBoard("Bug Workflow", [{ name: "Open", queryId: "900" }])

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.name).toBe("Bug Workflow")
    expect(body.widgets).toHaveLength(1)
  })

  it("repeats status and type as WIDGET filters, which is what the board renders", async () => {
    // Filters set only on the query are ignored by the board — the column then
    // shows every work package in the project.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 55 }),
      text: async () => "{}",
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const client = new OpenProjectClient("https://op.example.com", "demo", "token")
    await client.createBoard("Bug Workflow", [
      { name: "Open", queryId: "900", statusId: "7", typeId: "12" },
    ])

    const widget = JSON.parse(fetchMock.mock.calls[0][1].body).widgets[0]
    expect(widget.options.filters).toEqual([
      { status: { operator: "=", values: ["7"] } },
      { type: { operator: "=", values: ["12"] } },
    ])
    expect(widget.options.queryId).toBe("900")
  })
})
