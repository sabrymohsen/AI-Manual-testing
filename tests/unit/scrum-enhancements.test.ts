import { describe, it, expect, vi, beforeEach } from "vitest"
import { doneAt, startedAt, statusAt, statusMoves } from "@/lib/scrum/history"
import { mentionedUserIds, mentionsToPlain, plainToMentions, splitMentions } from "@/lib/scrum/mentions"

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12))
const task = (status: string, moves: [number, string][], created = 1) => ({
  status,
  createdAt: day(created),
  updatedAt: day(30),
  activities: moves.map(([d, details]) => ({ action: "moved", details, createdAt: day(d) })),
})

describe("status history from the activity log", () => {
  const t = task("DONE", [
    [3, "TODO → IN_PROGRESS"],
    [5, "IN_PROGRESS → TESTING"],
    [8, "TESTING → DONE"],
  ])

  it("reads the status on any day", () => {
    expect(statusAt(t, day(0).getTime())).toBeNull() // before it existed
    expect(statusAt(t, day(2).getTime())).toBe("TODO")
    expect(statusAt(t, day(4).getTime())).toBe("IN_PROGRESS")
    expect(statusAt(t, day(6).getTime())).toBe("TESTING")
    expect(statusAt(t, day(9).getTime())).toBe("DONE")
  })

  it("dates completion by the move to done, not by the last edit", () => {
    expect(doneAt(t)).toBe(day(8).getTime())
    expect(startedAt(t)).toBe(day(3).getTime())
  })

  it("uses the latest completion when a task was reopened", () => {
    const reopened = task("DONE", [[4, "TODO → DONE"], [6, "DONE → IN_PROGRESS"], [9, "IN_PROGRESS → DONE"]])
    expect(doneAt(reopened)).toBe(day(9).getTime())
    expect(statusAt(reopened, day(7).getTime())).toBe("IN_PROGRESS")
  })

  it("treats Deployed as done, and open tasks as not done", () => {
    expect(doneAt(task("DEPLOYED", [[5, "DONE → DEPLOYED"], [4, "TESTING → DONE"]]))).toBe(day(4).getTime())
    expect(doneAt(task("IN_PROGRESS", [[4, "TODO → IN_PROGRESS"]]))).toBeNull()
  })

  it("falls back to updatedAt for a task done before history existed", () => {
    expect(doneAt(task("DONE", []))).toBe(day(30).getTime())
    expect(statusAt(task("DONE", []), day(5).getTime())).toBe("DONE")
  })

  it("ignores activity that isn't a status move", () => {
    const t2 = { ...task("TODO", []), activities: [{ action: "updated", details: "Priority LOW → HIGH", createdAt: day(2) }, { action: "moved", details: "garbage", createdAt: day(3) }] }
    expect(statusMoves(t2)).toEqual([])
  })
})

describe("@mentions", () => {
  const text = "Hi @[Ann Lee](u1), please check with @[Bob](u2) and @[Ann Lee](u1)"

  it("finds each mentioned person once", () => {
    expect(mentionedUserIds(text)).toEqual(["u1", "u2"])
    expect(mentionedUserIds("no mentions, just an @email.com")).toEqual([])
  })

  it("splits text for highlighting", () => {
    expect(splitMentions("Hi @[Ann](u1)!")).toEqual([{ text: "Hi " }, { mention: "Ann", userId: "u1" }, { text: "!" }])
  })

  it("round-trips through plain text for editing", () => {
    const { text: plain, mentions } = mentionsToPlain(text)
    expect(plain).toBe("Hi @Ann Lee, please check with @Bob and @Ann Lee")
    expect(plainToMentions(plain, mentions)).toBe(text)
  })

  it("prefers the longer name and drops people removed from the text", () => {
    const picked = [{ name: "Ann", id: "a" }, { name: "Ann Lee", id: "al" }, { name: "Gone", id: "g" }]
    expect(plainToMentions("@Ann Lee and @Ann", picked)).toBe("@[Ann Lee](al) and @[Ann](a)")
    expect(mentionedUserIds(plainToMentions("@Ann only", picked))).toEqual(["a"])
  })
})

describe("per-project task numbers", () => {
  const aggregate = vi.fn()
  beforeEach(() => {
    vi.resetModules()
    aggregate.mockReset()
    vi.doMock("@/lib/db", () => ({ prisma: { task: { aggregate } } }))
  })

  it("starts a new project at 1 and continues from the project's own highest", async () => {
    const { nextTaskNumber } = await import("@/lib/scrum/task-number")
    aggregate.mockResolvedValueOnce({ _max: { taskNumber: null } })
    expect(await nextTaskNumber("p-new")).toBe(1)
    aggregate.mockResolvedValueOnce({ _max: { taskNumber: 41 } })
    expect(await nextTaskNumber("p-old")).toBe(42)
    expect(aggregate).toHaveBeenLastCalledWith({ where: { projectId: "p-old" }, _max: { taskNumber: true } })
  })

  it("takes the next number when two issues are created at once", async () => {
    const { withNextTaskNumber } = await import("@/lib/scrum/task-number")
    aggregate.mockResolvedValueOnce({ _max: { taskNumber: 4 } }).mockResolvedValueOnce({ _max: { taskNumber: 5 } })
    const create = vi.fn().mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" })).mockResolvedValueOnce("ok")
    expect(await withNextTaskNumber("p", create)).toBe("ok")
    expect(create.mock.calls.map((c) => c[0])).toEqual([5, 6])
  })

  it("doesn't retry other errors", async () => {
    const { withNextTaskNumber } = await import("@/lib/scrum/task-number")
    aggregate.mockResolvedValue({ _max: { taskNumber: 1 } })
    await expect(withNextTaskNumber("p", () => Promise.reject(new Error("db down")))).rejects.toThrow("db down")
  })
})

describe("sprint burndown from Scrum Board tasks", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("counts work remaining per day from when tasks were really finished", async () => {
    const sprint = { id: "s1", name: "Sprint 1", startDate: day(1), endDate: day(5), createdAt: day(1), status: "ACTIVE" }
    const tasks = [
      { ...task("DONE", [[2, "TODO → DONE"]]), id: "a", storyPoints: 3 },
      { ...task("DONE", [[4, "TESTING → DONE"]]), id: "b", storyPoints: 5 },
      { ...task("IN_PROGRESS", [[2, "TODO → IN_PROGRESS"]]), id: "c", storyPoints: 2 },
    ]
    vi.doMock("@/lib/db", () => ({
      prisma: {
        scrumSprint: { findFirst: vi.fn().mockResolvedValue(sprint) },
        task: { findMany: vi.fn().mockResolvedValue(tasks) },
      },
    }))
    const { getSprintBurndown } = await import("@/lib/reports/analytics")
    const r = await getSprintBurndown("p", "s1")
    expect(r.totalPoints).toBe(10)
    expect(r.unit).toBe("points")
    expect(r.points.map((p) => p.actual)).toEqual([10, 7, 7, 2, 2])
    expect(r.points[0].ideal).toBe(10)
    expect(r.points[4].ideal).toBe(0)
  })

  it("counts issues when nothing is estimated", async () => {
    const sprint = { id: "s1", name: "S", startDate: day(1), endDate: day(2), createdAt: day(1), status: "ACTIVE" }
    vi.doMock("@/lib/db", () => ({
      prisma: {
        scrumSprint: { findFirst: vi.fn().mockResolvedValue(sprint) },
        task: { findMany: vi.fn().mockResolvedValue([{ ...task("TODO", []), id: "x", storyPoints: null }, { ...task("DONE", [[1, "TODO → DONE"]]), id: "y", storyPoints: null }]) },
      },
    }))
    const { getSprintBurndown } = await import("@/lib/reports/analytics")
    const r = await getSprintBurndown("p", "s1")
    expect(r.unit).toBe("issues")
    expect(r.totalPoints).toBe(2)
    expect(r.points[1].actual).toBe(1)
  })
})
