/**
 * Board placement — the rules that keep a synced bug from turning into two
 * cards, and that stop a sync from dragging a card back out from under the
 * person who just moved it in the tracker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"
import { placeBugOnBoard } from "@/lib/integrations/core/sync-bug-report"
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

    expect(placed).toBe("2")
    expect(provider.placeOnColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("leaves a card where the user dragged it when the app-side column is unchanged", async () => {
    const provider = fakeProvider()
    // The bug still points at column 2, which is where sync last placed it.
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed).toBeUndefined()
    expect(provider.reconcileColumn).not.toHaveBeenCalled()
    expect(provider.placeOnColumn).not.toHaveBeenCalled()
  })

  it("moves the card when the column was changed in the app since the last sync", async () => {
    const provider = fakeProvider()
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "1")

    expect(placed).toBe("2")
    expect(provider.reconcileColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("puts a card back when it has fallen off the board", async () => {
    const provider = fakeProvider({ boardContains: vi.fn().mockResolvedValue(false) })
    const placed = await placeBugOnBoard(provider, "55", "101", "2", false, "2")

    expect(placed).toBe("2")
    expect(provider.placeOnColumn).toHaveBeenCalledWith("55", columns[1], "101")
  })

  it("never throws when the tracker rejects the placement", async () => {
    const provider = fakeProvider({
      getBoardColumns: vi.fn().mockRejectedValue(new Error("403 Forbidden")),
    })

    await expect(placeBugOnBoard(provider, "55", "101", "2", true, null)).resolves.toBeUndefined()
  })
})
