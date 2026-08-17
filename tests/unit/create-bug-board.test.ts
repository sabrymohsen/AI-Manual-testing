/**
 * Matching this app's bug statuses to the tracker's own. Getting it wrong builds
 * a board whose columns quietly hold the wrong cards — or two columns showing
 * the same ones.
 */
import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { planBugBoardColumns } from "@/lib/integrations/openproject/create-bug-board"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

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
