// Zustand store for the annotation editor — tool state, zoom, annotation list,
// selection, and a branch-free undo/redo history. One editor is open at a time
// (modal), so a module singleton is fine; `reset()` clears it on open.
import { create } from "zustand"
import { Annotation, CropRect, Snapshot, ToolId, uid, COLORS, ZOOM_MIN, ZOOM_MAX } from "./types"

interface EditorState {
  // Tool + style
  tool: ToolId
  color: string
  strokeWidth: number
  fontSize: number
  sticker: string // current sticker catalog key
  magnifierPower: number // 2 or 4

  // Model (image-space)
  annotations: Annotation[]
  crop: CropRect | null
  selectedId: string | null

  // View
  zoom: number
  toolbarCollapsed: boolean

  // History
  undoStack: Snapshot[]
  redoStack: Snapshot[]

  // Accessibility: screen-reader live-region message
  announcement: string

  // ── actions ──
  setTool: (t: ToolId) => void
  setColor: (c: string) => void
  setStrokeWidth: (n: number) => void
  setFontSize: (n: number) => void
  setSticker: (k: string) => void
  setMagnifierPower: (n: number) => void
  setZoom: (z: number) => void
  setSelectedId: (id: string | null) => void
  toggleToolbar: () => void
  announce: (msg: string) => void

  addAnnotation: (a: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>, options?: { history?: boolean }) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  setCrop: (c: CropRect | null) => void

  commit: () => void // push current state onto the undo stack (call BEFORE a change)
  undo: () => void
  redo: () => void
  reset: () => void
}

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
const snap = (s: EditorState): Snapshot => ({
  annotations: s.annotations.map((a) => ({ ...a })),
  crop: s.crop ? { ...s.crop } : null,
})

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "rect",
  color: COLORS[0],
  strokeWidth: 4,
  fontSize: 26,
  sticker: "bug",
  magnifierPower: 2,
  annotations: [],
  crop: null,
  selectedId: null,
  zoom: 1,
  toolbarCollapsed: false,
  undoStack: [],
  redoStack: [],
  announcement: "",

  setTool: (t) => set({ tool: t, announcement: `${t} tool` }),
  setColor: (c) => {
    const { selectedId, annotations } = get()
    if (selectedId) {
      get().commit()
      set({ annotations: annotations.map((a) => (a.id === selectedId ? { ...a, color: c } : a)) })
    }
    set({ color: c })
  },
  setStrokeWidth: (n) => set({ strokeWidth: n }),
  setFontSize: (n) => {
    // Mirror setColor: if a text/sticker/number is selected, resize it live
    // (with one undo entry) so the size control edits the placed label too.
    const { selectedId, annotations } = get()
    const sel = annotations.find((a) => a.id === selectedId)
    if (sel && (sel.type === "text" || sel.type === "sticker" || sel.type === "number")) {
      get().commit()
      set({ annotations: annotations.map((a) => (a.id === selectedId ? { ...a, fontSize: n } : a)) })
    }
    set({ fontSize: n })
  },
  setSticker: (k) => set({ sticker: k }),
  setMagnifierPower: (n) => set({ magnifierPower: n }),
  setZoom: (z) => set({ zoom: clampZoom(z), announcement: `Zoom ${Math.round(clampZoom(z) * 100)}%` }),
  setSelectedId: (id) => set({ selectedId: id }),
  toggleToolbar: () => set((s) => ({ toolbarCollapsed: !s.toolbarCollapsed })),
  announce: (msg) => set({ announcement: msg }),

  addAnnotation: (a) => {
    get().commit()
    set((s) => ({ annotations: [...s.annotations, a], selectedId: a.id, announcement: `${a.type} added` }))
  },

  updateAnnotation: (id, patch, options) => {
    if (options?.history !== false) get().commit()
    set((s) => ({ annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  },

  deleteSelected: () => {
    const { selectedId } = get()
    if (!selectedId) return
    get().commit()
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== selectedId),
      selectedId: null,
      announcement: "Annotation deleted",
    }))
  },

  duplicateSelected: () => {
    const { selectedId, annotations } = get()
    const src = annotations.find((a) => a.id === selectedId)
    if (!src) return
    get().commit()
    const copy: Annotation = {
      ...src,
      id: uid(),
      x: src.x + 20,
      y: src.y + 20,
      points: src.points ? src.points.map((p, i) => p + (i % 2 === 0 ? 20 : 20)) : undefined,
    }
    set((s) => ({ annotations: [...s.annotations, copy], selectedId: copy.id, announcement: "Annotation duplicated" }))
  },

  setCrop: (c) => {
    get().commit()
    set({ crop: c, announcement: c ? "Crop region set" : "Crop cleared" })
  },

  commit: () =>
    set((s) => ({ undoStack: [...s.undoStack, snap(s)].slice(-100), redoStack: [] })),

  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s
      const prev = s.undoStack[s.undoStack.length - 1]
      return {
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snap(s)],
        annotations: prev.annotations,
        crop: prev.crop,
        selectedId: null,
        announcement: "Undo",
      }
    }),

  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0) return s
      const next = s.redoStack[s.redoStack.length - 1]
      return {
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snap(s)],
        annotations: next.annotations,
        crop: next.crop,
        selectedId: null,
        announcement: "Redo",
      }
    }),

  reset: () =>
    set({
      tool: "rect",
      color: COLORS[0],
      strokeWidth: 4,
      fontSize: 26,
      sticker: "bug",
      magnifierPower: 2,
      annotations: [],
      crop: null,
      selectedId: null,
      zoom: 1,
      toolbarCollapsed: false,
      undoStack: [],
      redoStack: [],
      announcement: "",
    }),
}))
