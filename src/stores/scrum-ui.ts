import { create } from "zustand"

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
}))
