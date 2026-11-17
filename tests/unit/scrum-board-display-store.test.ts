import { describe, it, expect, beforeEach } from "vitest"
import { useScrumUI, DEFAULT_BOARD_DISPLAY, boardDisplayFor } from "@/stores/scrum-ui"

describe("board display state is per project", () => {
  beforeEach(() => useScrumUI.setState({ boardDisplayByProject: {} }))

  it("does not carry an epic filter or grouping into another project's board", () => {
    useScrumUI.getState().setBoardDisplay("project-a", { epicFilter: "epic-x", swimlane: "epic" })
    const s = useScrumUI.getState()
    expect(boardDisplayFor(s, "project-a")).toMatchObject({ epicFilter: "epic-x", swimlane: "epic" })
    expect(boardDisplayFor(s, "project-b")).toEqual(DEFAULT_BOARD_DISPLAY)
  })

  it("merges patches within a project", () => {
    useScrumUI.getState().setBoardDisplay("p", { cardLayout: "compact" })
    useScrumUI.getState().setBoardDisplay("p", { showSubtasks: false })
    expect(boardDisplayFor(useScrumUI.getState(), "p")).toMatchObject({ cardLayout: "compact", showSubtasks: false, swimlane: "none" })
  })
})
