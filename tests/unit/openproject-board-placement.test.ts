/**
 * Board placement — the rules that keep a synced bug from turning into two
 * cards, and that stop a sync from dragging a card back out from under the
 * person who just moved it in the tracker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"
import { OpenProjectProvider } from "@/lib/integrations/providers/openproject.provider"
import { placeBugOnBoard, isMissingRemoteItem } from "@/lib/integrations/core/sync-bug-report"
import type { WorkItemProvider } from "@/lib/integrations/core/provider"

// A board grid as OpenProject returns it: two columns, each rendering an
// explicit list of work package ids in its widget filter.
function grid(columns: Record<number, string[]>, lockVersion = 7) {
  return {
    lockVersion,
    widgets: Object.entries(columns).map(([id, values]) => ({
      id: Number(id),
      startColumn: Number(id),
      options: { queryId: id, filters: [{ id: { operator: "=", values } }] },
    })),
  }
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe("OpenProjectClient board grid writes", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const originalFetch = global.fetch
  const client = new OpenProjectClient("https://op.example.com", "demo", "token")

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  /** The widgets array sent on the nth PATCH. */
  const patchedWidgets = (call: number) =>
    JSON.parse((fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")[call][1] as any).body)

  it("moves a card to the target column and removes it from the old one", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(grid({ 1: ["101", "102"], 2: [] })))
      .mockResolvedValueOnce(jsonResponse({}))

    const ok = await client.setBoardCardColumn(55, 2, "101")

    expect(ok).toBe(true)
    const body = patchedWidgets(0)
    expect(body.widgets[0].options.filters[0].id.values).toEqual(["102"])
    expect(body.widgets[1].options.filters[0].id.values).toEqual(["101"])
    // The card exists in exactly one column — never in both.
    expect(body.widgets.flatMap((w: any) => w.options.filters[0].id.values).filter((v: string) => v === "101"))
      .toHaveLength(1)
  })

  it("sends the grid lockVersion so a concurrent drag can't be silently clobbered", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(grid({ 1: ["101"], 2: [] }, 42)))
      .mockResolvedValueOnce(jsonResponse({}))

    await client.setBoardCardColumn(55, 2, "101")

    expect(patchedWidgets(0).lockVersion).toBe(42)
  })

  it("re-reads and re-applies against the newer grid when the PATCH conflicts", async () => {
    fetchMock
      // First read: card is in column 1.
      .mockResolvedValueOnce(jsonResponse(grid({ 1: ["101"], 2: ["999"] }, 42)))
      .mockResolvedValueOnce(jsonResponse({ message: "stale" }, 409))
      // Someone else added #777 to column 2 in the meantime.
      .mockResolvedValueOnce(jsonResponse(grid({ 1: ["101"], 2: ["999", "777"] }, 43)))
      .mockResolvedValueOnce(jsonResponse({}))

    const ok = await client.setBoardCardColumn(55, 2, "101")

    expect(ok).toBe(true)
    const retry = patchedWidgets(1)
    expect(retry.lockVersion).toBe(43)
    // The concurrent change survives — we merged onto it instead of overwriting.
    expect(retry.widgets[1].options.filters[0].id.values).toEqual(["999", "777", "101"])
  })

  it("writes nothing when the card is already in the target column", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(grid({ 1: [], 2: ["101"] })))

    const ok = await client.setBoardCardColumn(55, 2, "101")

    expect(ok).toBe(true)
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(0)
  })

  it("drops the filter instead of writing an empty one when a column is emptied", async () => {
    // `{ id: { operator: "=", values: [] } }` is not a valid OpenProject filter,
    // and a widget carrying one stops being a column — that is how emptying a
    // column could take the column itself down.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(grid({ 1: ["101"], 2: [] })))
      .mockResolvedValueOnce(jsonResponse({}))

    await client.setBoardCardColumn(55, 2, "101")

    const emptied = patchedWidgets(0).widgets[0]
    expect(emptied.options.filters).toEqual([])
  })

  it("refuses to write when the board read comes back with no widgets", async () => {
    // A PATCH carrying an empty widgets array deletes every column on the board.
    fetchMock.mockResolvedValueOnce(jsonResponse({ lockVersion: 3, _embedded: { widgets: [] } }))

    const ok = await client.setBoardWidgetIdFilter(55, 1, ["101"])

    expect(ok).toBe(false)
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(0)
  })

  it("refuses to write an update that would change which columns exist", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(grid({ 1: ["101"], 2: [] })))

    // A mutation that drops a widget must never reach the board.
    const ok = await (client as any).patchGridWidgets(55, (widgets: any[]) => widgets.slice(0, 1))

    expect(ok).toBe(false)
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(0)
  })

  it("reports every column whose filter lists the card", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(grid({ 1: ["101", "102"], 2: ["101"] })))

    // #101 is pinned in both columns — the stuck state.
    expect(await client.getWidgetIdsContaining(55, "101")).toEqual(["1", "2"])
  })

  it("reports a single column for a normally-placed card", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(grid({ 1: ["102"], 2: ["101"] })))

    expect(await client.getWidgetIdsContaining(55, "101")).toEqual(["2"])
  })

  it("does not add a work package that the column already lists", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(grid({ 1: ["101"] })))

    const ok = await client.addWorkPackageToBoardWidget(55, 1, "101")

    expect(ok).toBe(true)
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(0)
  })
})

describe("placeBugOnBoard", () => {
  const columns = [
    { id: "1", name: "New", columnType: "basic" as const, attributeId: "1" },
    { id: "2", name: "In Progress", columnType: "basic" as const, attributeId: "2" },
  ]

  function fakeProvider(overrides: Partial<WorkItemProvider> = {}) {
    return {
      getBoardColumns: vi.fn().mockResolvedValue(columns),
      reconcileColumn: vi.fn().mockResolvedValue(true),
      placeOnColumn: vi.fn().mockResolvedValue(true),
      boardContains: vi.fn().mockResolvedValue(true),
      ...overrides,
    } as unknown as WorkItemProvider
  }

  it("drops a brand-new card into the chosen column", async () => {
    const provider = fakeProvider()
    const placed = await placeBugOnBoard(provider, "55", "101", "2", true, null)

    expect(placed.columnId).toBe("2")
    expect(provider.placeOnColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("leaves a card where the user dragged it when the app-side column is unchanged", async () => {
    const provider = fakeProvider()
    // The bug still points at column 2, which is where sync last placed it.
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBeUndefined()
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
    expect(provider.placeOnColumn).not.toHaveBeenCalled()
  })

  it("moves the card when the column was changed in the app since the last sync", async () => {
    const provider = fakeProvider()
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "1")

    expect(placed.columnId).toBe("2")
    expect(provider.reconcileColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("puts a card back when it has fallen off the board", async () => {
    const provider = fakeProvider({ boardContains: vi.fn().mockResolvedValue(false) })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBe("2")
    expect(provider.placeOnColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("collapses a card that is stuck rendering in two columns at once", async () => {
    // The app-side column is unchanged, so the normal rule is "leave it alone".
    // But the card is in both columns — a state no drag can produce — so it is
    // stuck: every future sync would see "unchanged" and skip it forever.
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["1", "2"]),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBe("2")
    expect(provider.reconcileColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("still leaves a card alone when it sits in exactly one column", async () => {
    // One column means the user dragged it there deliberately. The tracker wins.
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["1"]),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBeUndefined()
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
  })

  it("leaves the card alone when the provider cannot report its columns", async () => {
    // getCardColumns is optional; providers without it keep the old behaviour.
    const provider = fakeProvider()
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBeUndefined()
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
  })

  it("does not collapse when no column is chosen app-side", async () => {
    // With no target there is nothing to collapse *to* — guessing would move
    // the card somewhere the user never asked for.
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["1", "2"]),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", null, false, null)

    expect(placed.columnId).toBeUndefined()
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
  })

  it("adopts the column the card was dragged to in the tracker", async () => {
    // App believes column 2; the tracker's own query says the card is in 1.
    // The tracker wins — and the app must record that, not just accept it.
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["2"]),
      getTrackerColumn: vi.fn().mockResolvedValue("1"),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBe("1")
    expect(placed.adopted).toBe(true)
    expect(provider.reconcileColumn).toHaveBeenCalledWith("55", columns[0], "101")
  })

  it("explains an unplaceable card instead of only logging it", async () => {
    // The reason a card didn't move has to reach the person who pressed Sync.
    const provider = fakeProvider({
      getBoardColumns: vi.fn().mockRejectedValue(new Error('Workflow does not allow moving #101 to "Done".')),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "1")

    expect(placed.columnId).toBeUndefined()
    expect(placed.warning).toMatch(/could not be placed.*Workflow does not allow/)
  })

  it("does not adopt when the tracker agrees with the app", async () => {
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["2"]),
      getTrackerColumn: vi.fn().mockResolvedValue("2"),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed).toEqual({})
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
  })

  it("does not adopt a column that is no longer on the board", async () => {
    // A stale/removed column must not be written back to the bug.
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["2"]),
      getTrackerColumn: vi.fn().mockResolvedValue("99"),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed).toEqual({})
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
  })

  it("prefers collapsing a split card over adopting a tracker move", async () => {
    // Both signals present: the split is our own bug and must be fixed first,
    // and collapsing already writes the card into exactly one column.
    const provider = fakeProvider({
      getCardColumns: vi.fn().mockResolvedValue(["1", "2"]),
      getTrackerColumn: vi.fn().mockResolvedValue("1"),
    })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed.columnId).toBe("2")
    expect(placed.adopted).toBeUndefined()
    expect(provider.getTrackerColumn).not.toHaveBeenCalled()
  })

  it("never throws when the tracker rejects the placement", async () => {
    const provider = fakeProvider({
      getBoardColumns: vi.fn().mockRejectedValue(new Error("403 Forbidden")),
    })

    const placed = await placeBugOnBoard(provider, "55", "101", "2", true, null)
    expect(placed.columnId).toBeUndefined()
    expect(placed.warning).toContain("403 Forbidden")
  })

  describe("status boards", () => {
    const statusColumns = [
      { id: "10", name: "New", columnType: "status" as const, attributeId: "1" },
      { id: "11", name: "In progress", columnType: "status" as const, attributeId: "7" },
    ]
    const statusProvider = (overrides: Partial<WorkItemProvider> = {}) =>
      fakeProvider({ getBoardColumns: vi.fn().mockResolvedValue(statusColumns), ...overrides })

    it("transitions a new bug into the column the user picked", async () => {
      const provider = statusProvider()
      const placed = await placeBugOnBoard(provider, "55", "101", "11", true, null)

      expect(placed.columnId).toBe("11")
      expect(provider.placeOnColumn).toHaveBeenCalledWith("55", statusColumns[1], "101")
    })

    it("moves the card when the app-side column changed", async () => {
      const provider = statusProvider()
      const placed = await placeBugOnBoard(provider, "55", "101", "11", false, "10")

      expect(placed.columnId).toBe("11")
      expect(provider.reconcileColumn).toHaveBeenCalledWith("55", statusColumns[1], "101")
    })

    it("does not force a status on a new bug when no column was chosen", async () => {
      // Falling back to the leftmost column here would overwrite the status the
      // bug was just created with — a silent edit nobody asked for.
      const provider = statusProvider()
      const placed = await placeBugOnBoard(provider, "55", "101", null, true, null)

      expect(placed.columnId).toBeUndefined()
      expect(provider.placeOnColumn).not.toHaveBeenCalled()
      expect(provider.reconcileColumn).not.toHaveBeenCalled()
    })
  })
})

describe("OpenProjectProvider status-column placement", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const originalFetch = global.fetch
  const column = { id: "11", name: "In progress", columnType: "status" as const, attributeId: "7" }

  function provider() {
    return new OpenProjectProvider({
      baseUrl: "https://op.example.com",
      externalProjectKey: "demo",
      apiToken: "token",
    } as any)
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  /** The work-package form response listing the workflow's reachable statuses. */
  const form = (ids: number[]) =>
    jsonResponse({ _embedded: { schema: { status: { _embedded: { allowedValues: ids.map((id) => ({ id })) } } } } })

  it("PATCHes the target status when the workflow permits the transition", async () => {
    fetchMock
      .mockResolvedValueOnce(form([1, 7])) // POST /form — 7 is reachable
      .mockResolvedValueOnce(jsonResponse({ id: 101, lockVersion: 3 })) // GET the WP
      .mockResolvedValueOnce(jsonResponse({ id: 101, lockVersion: 4 })) // PATCH

    const ok = await provider().reconcileColumn("55", column, "101")

    expect(ok).toBe(true)
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH")!
    expect(JSON.parse(patch[1].body)._links.status.href).toBe("/api/v3/statuses/7")
    expect(JSON.parse(patch[1].body).lockVersion).toBe(3)
  })

  it("refuses the move and names the reachable statuses when the workflow forbids it", async () => {
    fetchMock
      .mockResolvedValueOnce(form([1, 3])) // 7 is NOT reachable
      .mockResolvedValueOnce(jsonResponse({ _embedded: { elements: [
        { id: 1, name: "New" }, { id: 3, name: "Closed" }, { id: 7, name: "In progress" },
      ] } }))

    const move = provider().reconcileColumn("55", column, "101")
    await expect(move).rejects.toThrow(/Workflow does not allow moving #101 to "In progress"/)
    // The message names what the workflow WOULD accept, so the fix is obvious.
    await expect(move).rejects.toThrow(/Allowed from its current status: New, Closed/)
    // The doomed PATCH is never sent.
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(0)
  })

  it("attempts the transition anyway when the allowed set cannot be read", async () => {
    // Older instances / restricted tokens can't read the form. Blocking here
    // would break status boards that actually work.
    fetchMock
      // 403 on the form read, twice: apiFetch retries once with the Bearer header.
      .mockResolvedValueOnce(jsonResponse({ message: "forbidden" }, 403))
      .mockResolvedValueOnce(jsonResponse({ message: "forbidden" }, 403))
      .mockResolvedValueOnce(jsonResponse({ id: 101, lockVersion: 3 }))
      .mockResolvedValueOnce(jsonResponse({ id: 101, lockVersion: 4 }))

    const ok = await provider().reconcileColumn("55", column, "101")

    expect(ok).toBe(true)
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(1)
  })
})

describe("isMissingRemoteItem", () => {
  it("recognises the tracker's 404", () => {
    // The exact shape OpenProjectClient.apiJson throws.
    expect(isMissingRemoteItem(new Error("OpenProject API 404 — Resource not found"))).toBe(true)
  })

  it("recognises a plain not-found message from another provider", () => {
    expect(isMissingRemoteItem(new Error("Issue does not exist or you do not have permission"))).toBe(false)
    expect(isMissingRemoteItem(new Error("Work item not found"))).toBe(true)
  })

  it("does not treat auth or server failures as a deleted item", () => {
    // Recreating the work item on any of these would duplicate it.
    expect(isMissingRemoteItem(new Error("OpenProject API 403 — Permission denied"))).toBe(false)
    expect(isMissingRemoteItem(new Error("OpenProject API 500"))).toBe(false)
    expect(isMissingRemoteItem(new Error("OpenProject unreachable at https://op: timeout"))).toBe(false)
  })

  it("survives a non-Error throw", () => {
    expect(isMissingRemoteItem("404")).toBe(true)
    expect(isMissingRemoteItem(null)).toBe(false)
  })
})
