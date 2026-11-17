import { create } from "zustand"
import type { CardLayout } from "@/components/scrum/board/card-layout-toggle"
import type { SwimlaneMode } from "@/components/scrum/board/swimlane-toggle"
import type { QuickFilter } from "@/components/scrum/board/quick-filters"

/** Board-view display options, shared by the page header (Display menu) and BoardView. */
export interface BoardDisplay {
  swimlane: SwimlaneMode
  cardLayout: CardLayout
  showEstimations: boolean
  showSubtasks: boolean
  quickFilters: QuickFilter[]
  epicFilter: string | null
}

export const DEFAULT_BOARD_DISPLAY: BoardDisplay = {
  swimlane: "none",
  cardLayout: "detailed",
  showEstimations: true,
  showSubtasks: true,
  quickFilters: [],
  epicFilter: null,
}

type ScrumView = "board" | "list" | "timeline"

interface ScrumUIState {
  // Task detail drawer
  openTaskId: string | null
  openTask: (id: string) => void
  closeTask: () => void

  // Create modals
  createTaskOpen: boolean
  createTaskStatus: string | null // preselected column status
  createTaskSprintId: string | null // preselected sprint (backlog view)
  createTaskType: string | null // preselected issue type (Create Issue menu)
  openCreateTask: (status?: string, sprintId?: string | null, type?: string | null) => void
  closeCreateTask: () => void

  createEpicOpen: boolean
  setCreateEpicOpen: (v: boolean) => void

  createSprintOpen: boolean
  setCreateSprintOpen: (v: boolean) => void

  importOpen: boolean
  setImportOpen: (v: boolean) => void

  // Filter panel
  filterPanelOpen: boolean
  setFilterPanelOpen: (v: boolean) => void

  // Active view (mirrored to URL by the page)
  view: ScrumView
  setView: (v: ScrumView) => void

  /** Board display options, kept per project so filters never leak between boards. */
  boardDisplayByProject: Record<string, BoardDisplay>
  setBoardDisplay: (projectId: string, patch: Partial<BoardDisplay>) => void
}

export const useScrumUI = create<ScrumUIState>((set) => ({
  openTaskId: null,
  openTask: (id) => set({ openTaskId: id }),
  closeTask: () => set({ openTaskId: null }),

  createTaskOpen: false,
  createTaskStatus: null,
  createTaskSprintId: null,
  createTaskType: null,
  openCreateTask: (status, sprintId, type) =>
    set({
      createTaskOpen: true,
      createTaskStatus: status ?? null,
      createTaskSprintId: sprintId ?? null,
      createTaskType: type ?? null,
    }),
  closeCreateTask: () =>
    set({ createTaskOpen: false, createTaskStatus: null, createTaskSprintId: null, createTaskType: null }),

  createEpicOpen: false,
  setCreateEpicOpen: (v) => set({ createEpicOpen: v }),

  createSprintOpen: false,
  setCreateSprintOpen: (v) => set({ createSprintOpen: v }),

  importOpen: false,
  setImportOpen: (v) => set({ importOpen: v }),

  filterPanelOpen: false,
  setFilterPanelOpen: (v) => set({ filterPanelOpen: v }),

  view: "board",
  setView: (v) => set({ view: v }),

  boardDisplayByProject: {},
  setBoardDisplay: (projectId, patch) =>
    set((st) => ({
      boardDisplayByProject: {
        ...st.boardDisplayByProject,
        [projectId]: { ...(st.boardDisplayByProject[projectId] ?? DEFAULT_BOARD_DISPLAY), ...patch },
      },
    })),
}))

/** The board display options for one project (defaults until changed). */
export function boardDisplayFor(state: Pick<ScrumUIState, "boardDisplayByProject">, projectId: string): BoardDisplay {
  return state.boardDisplayByProject[projectId] ?? DEFAULT_BOARD_DISPLAY
}
