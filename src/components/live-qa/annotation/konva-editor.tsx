"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Konva from "konva"
import { Stage, Layer, Rect, Ellipse, Arrow, Line, Text as KText, Image as KImage, Transformer, Circle, Group } from "react-konva"
import { Button } from "@/components/ui/button"
import {
  MousePointer2,
  Square,
  Highlighter,
  Circle as CircleIcon,
  ArrowUpRight,
  Type,
  EyeOff,
  Crop,
  Undo2,
  Redo2,
  Trash2,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  Minus,
  PenLine,
  Grid3x3,
  Hash,
  Sticker as StickerIcon,
  Ruler,
  Lightbulb,
  Search as SearchIcon,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"
import { useEditorStore } from "./store"
import {
  Annotation,
  AnnotationType,
  CropRect,
  ToolId,
  uid,
  COLORS,
  TOOL_SHORTCUTS,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  BOX_TYPES,
  POINT_TYPES,
  STICKERS,
  ASPECT_RATIOS,
  MAGNIFIER_POWERS,
  stickerByKey,
  ScreenshotMetadata,
  detectPlatform,
} from "./types"
import { renderToDataUrl, exportPdf, exportJson, dataUrlToBlob, downloadDataUrl } from "./export"
import { InfoPanel, ExportFormat } from "./info-panel"
import { CompareSlider } from "./compare-slider"

interface Props {
  imageSrc: string
  onSave: (dataUrl: string) => void
  onCancel: () => void
  saving?: boolean
}

const TOOLS: Array<{ id: ToolId; icon: any; label: string; key: string; group: string }> = [
  { id: "select", icon: MousePointer2, label: "Select", key: "V", group: "select" },
  { id: "rect", icon: Square, label: "Rectangle", key: "R", group: "shape" },
  { id: "ellipse", icon: CircleIcon, label: "Ellipse", key: "E", group: "shape" },
  { id: "line", icon: Minus, label: "Line", key: "L", group: "shape" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow", key: "A", group: "shape" },
  { id: "freehand", icon: PenLine, label: "Pen", key: "P", group: "shape" },
  { id: "highlight", icon: Highlighter, label: "Highlight", key: "H", group: "mark" },
  { id: "text", icon: Type, label: "Text", key: "T", group: "mark" },
  { id: "number", icon: Hash, label: "Number", key: "N", group: "mark" },
  { id: "sticker", icon: StickerIcon, label: "Sticker", key: "S", group: "mark" },
  { id: "measure", icon: Ruler, label: "Measure", key: "M", group: "mark" },
  { id: "blur", icon: EyeOff, label: "Blur", key: "B", group: "redact" },
  { id: "pixelate", icon: Grid3x3, label: "Pixelate", key: "K", group: "redact" },
  { id: "spotlight", icon: Lightbulb, label: "Spotlight", key: "O", group: "redact" },
  { id: "magnifier", icon: SearchIcon, label: "Magnifier", key: "G", group: "view" },
  { id: "crop", icon: Crop, label: "Crop", key: "C", group: "crop" },
]

export default function KonvaAnnotationEditor({ imageSrc, onSave, onCancel, saving }: Props) {
  const store = useEditorStore()
  const {
    tool, color, strokeWidth, fontSize, sticker, magnifierPower, annotations, crop, selectedId, zoom,
    toolbarCollapsed, undoStack, redoStack, announcement,
  } = store

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState({ w: 800, h: 500 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoomText, setZoomText] = useState("100")

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const trRef = useRef<Konva.Transformer | null>(null)
  const layerRef = useRef<Konva.Layer | null>(null)

  // Draft (in-progress) shape + crop, kept in local state for live preview.
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null)
  const drawing = useRef(false)
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string; editId?: string } | null>(null)
  // Magnifier lens (live viewing aid) + crop aspect-ratio constraint.
  const [lens, setLens] = useState<{ sx: number; sy: number; imgX: number; imgY: number } | null>(null)
  const [cropAspect, setCropAspect] = useState<number | null>(null)

  // Phase 3: info panel, metadata, compare, export/share state.
  const [showPanel, setShowPanel] = useState(true)
  const [compareSrc, setCompareSrc] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [metadata, setMetadata] = useState<ScreenshotMetadata>({
    title: "",
    description: "",
    tags: [],
    url: "",
    severity: null,
    capturedAt: new Date().toLocaleString(),
    os: "",
    browser: "",
    dimensions: "",
  })

  // ── Reset store on (re)open ────────────────────────────────────────────────
  useEffect(() => {
    store.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc])

  // ── Load image ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const image = new window.Image()
    image.crossOrigin = "anonymous"
    image.src = imageSrc
    image.onload = () => {
      setImg(image)
      const { os, browser } = detectPlatform(navigator.userAgent)
      setMetadata((m) => ({
        ...m,
        capturedAt: new Date().toLocaleString(),
        os,
        browser,
        dimensions: `${image.naturalWidth} × ${image.naturalHeight}`,
      }))
    }
  }, [imageSrc])

  // ── Measure the canvas area ────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setStageSize({ w: Math.max(100, r.width), h: Math.max(100, r.height) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit zoom for the current image + stage size.
  const fitZoom = useMemo(() => {
    if (!img) return 1
    return Math.min(stageSize.w / img.naturalWidth, stageSize.h / img.naturalHeight, 1)
  }, [img, stageSize])

  const centerPan = useCallback(
    (z: number) => {
      if (!img) return { x: 0, y: 0 }
      return {
        x: (stageSize.w - img.naturalWidth * z) / 2,
        y: (stageSize.h - img.naturalHeight * z) / 2,
      }
    },
    [img, stageSize]
  )

  // Fit-to-screen on first load / when the image changes.
  const didFit = useRef(false)
  useEffect(() => {
    if (!img) return
    didFit.current = false
  }, [img])
  useEffect(() => {
    if (!img || didFit.current || stageSize.w < 120) return
    didFit.current = true
    store.setZoom(fitZoom)
    setZoomText(String(Math.round(fitZoom * 100)))
    setPan(centerPan(fitZoom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, fitZoom, stageSize, centerPan])

  // ── Zoom helpers (instant — no tween/animation) ────────────────────────────
  const applyZoom = useCallback(
    (nextScale: number, focus?: { x: number; y: number }) => {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(nextScale * 100) / 100))
      const old = zoom
      const fx = focus ? focus.x : stageSize.w / 2
      const fy = focus ? focus.y : stageSize.h / 2
      const worldX = (fx - pan.x) / old
      const worldY = (fy - pan.y) / old
      setPan({ x: fx - worldX * z, y: fy - worldY * z })
      store.setZoom(z)
      setZoomText(String(Math.round(z * 100)))
    },
    [zoom, pan, stageSize, store]
  )

  const commitZoomText = () => {
    const n = parseInt(zoomText, 10)
    if (Number.isFinite(n) && n > 0) applyZoom(n / 100)
    else setZoomText(String(Math.round(zoom * 100)))
  }

  const fitToScreen = () => {
    store.setZoom(fitZoom)
    setZoomText(String(Math.round(fitZoom * 100)))
    setPan(centerPan(fitZoom))
  }

  // Ctrl+wheel zoom-to-cursor; block the browser's native zoom. Native
  // non-passive listener so preventDefault actually works.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY < 0 ? 1.08 : 0.92
      applyZoom(zoom * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoom, applyZoom])

  // ── Transformer: attach to the selected node ───────────────────────────────
  useEffect(() => {
    const tr = trRef.current
    const layer = layerRef.current
    if (!tr || !layer) return
    const sel = annotations.find((a) => a.id === selectedId)
    if (sel && selectedId && BOX_TYPES.has(sel.type) && !sel.locked && tool === "select") {
      const node = layer.findOne(`#${selectedId}`)
      tr.nodes(node ? [node] : [])
    } else {
      tr.nodes([])
    }
    tr.getLayer()?.batchDraw()
  }, [selectedId, annotations, tool])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return
      const target = e.target as HTMLElement
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        e.shiftKey ? store.redo() : store.undo()
        return
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault()
        store.redo()
        return
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault()
        store.duplicateSelected()
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) { e.preventDefault(); store.deleteSelected() }
        return
      }
      if (e.key === "Escape") { store.setSelectedId(null); setDraft(null); setCropDraft(null); return }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); applyZoom(zoom + ZOOM_STEP); return }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); applyZoom(zoom - ZOOM_STEP); return }
      if (e.key === "0") { e.preventDefault(); fitToScreen(); return }
      const t = TOOL_SHORTCUTS[e.key.toLowerCase()]
      if (t && !mod) { store.setTool(t) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, zoom, textInput])

  // ── Pointer → image coordinates (accounts for zoom + pan) ───────────────────
  const pointer = () => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    return stage.getRelativePointerPosition() || { x: 0, y: 0 }
  }

  // Snap an endpoint to the nearest 45° from the start point (Shift while drawing).
  const snap45 = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.hypot(dx, dy)
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    return { x: x1 + Math.cos(ang) * dist, y: y1 + Math.sin(ang) * dist }
  }

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (textInput || tool === "magnifier") return
    const p = pointer()

    if (tool === "select") {
      if (e.target === e.target.getStage() || e.target.id() === "bg") store.setSelectedId(null)
      return
    }
    if (tool === "text") {
      setTextInput({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, value: "" })
      return
    }
    if (tool === "number") {
      const next = annotations.filter((a) => a.type === "number").reduce((m, a) => Math.max(m, a.badge || 0), 0) + 1
      store.addAnnotation({ id: uid(), type: "number", x: p.x, y: p.y, width: 0, height: 0, badge: next, color, strokeWidth })
      return // keep the tool active for consecutive numbering
    }
    if (tool === "sticker") {
      store.addAnnotation({ id: uid(), type: "sticker", x: p.x, y: p.y, width: 0, height: 0, sticker, fontSize: 30, color, strokeWidth })
      return
    }
    if (tool === "crop") {
      drawing.current = true
      setCropDraft({ x: p.x, y: p.y, width: 0, height: 0 })
      return
    }
    drawing.current = true
    if (tool === "arrow" || tool === "line") {
      setDraft({ id: uid(), type: tool, x: 0, y: 0, width: 0, height: 0, points: [p.x, p.y, p.x, p.y], color, strokeWidth })
    } else if (tool === "freehand") {
      setDraft({ id: uid(), type: "freehand", x: 0, y: 0, width: 0, height: 0, points: [p.x, p.y], color, strokeWidth })
    } else {
      setDraft({ id: uid(), type: tool as AnnotationType, x: p.x, y: p.y, width: 0, height: 0, color, strokeWidth })
    }
  }

  const onStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const p = pointer()
    if (tool === "magnifier") {
      const sp = stageRef.current?.getPointerPosition()
      if (sp) setLens({ sx: sp.x, sy: sp.y, imgX: p.x, imgY: p.y })
    }
    if (!drawing.current) return
    const shift = e.evt.shiftKey
    if (cropDraft) {
      let w = p.x - cropDraft.x
      let h = p.y - cropDraft.y
      if (cropAspect) h = (Math.sign(h) || 1) * (Math.abs(w) / cropAspect)
      setCropDraft({ ...cropDraft, width: w, height: h })
      return
    }
    if (!draft) return
    if (draft.type === "freehand") {
      setDraft({ ...draft, points: [...(draft.points || []), p.x, p.y] })
      return
    }
    if (draft.type === "arrow" || draft.type === "line") {
      const [x1, y1] = draft.points!
      const end = shift ? snap45(x1, y1, p.x, p.y) : { x: p.x, y: p.y }
      setDraft({ ...draft, points: [x1, y1, end.x, end.y] })
      return
    }
    setDraft({ ...draft, width: p.x - draft.x, height: p.y - draft.y })
  }

  const onStageMouseUp = () => {
    if (!drawing.current) return
    drawing.current = false

    if (cropDraft) {
      const c: CropRect = {
        x: Math.min(cropDraft.x, cropDraft.x + cropDraft.width),
        y: Math.min(cropDraft.y, cropDraft.y + cropDraft.height),
        width: Math.abs(cropDraft.width),
        height: Math.abs(cropDraft.height),
      }
      setCropDraft(null)
      if (c.width > 10 && c.height > 10) store.setCrop(c)
      return
    }

    if (!draft) return
    let finished = draft
    if (draft.type === "arrow" || draft.type === "line") {
      const [x1, y1, x2, y2] = draft.points!
      if (Math.hypot(x2 - x1, y2 - y1) < 6) { setDraft(null); return }
    } else if (draft.type === "freehand") {
      if ((draft.points?.length || 0) < 4) { setDraft(null); return }
    } else {
      // Normalize negative drags.
      finished = {
        ...draft,
        x: Math.min(draft.x, draft.x + draft.width),
        y: Math.min(draft.y, draft.y + draft.height),
        width: Math.abs(draft.width),
        height: Math.abs(draft.height),
      }
      if (finished.width < 5 && finished.height < 5) { setDraft(null); return }
    }
    store.addAnnotation(finished)
    setDraft(null)
    store.setTool("select")
  }

  // ── Text overlay commit ────────────────────────────────────────────────────
  const commitText = () => {
    if (!textInput) return
    const val = textInput.value.trim()
    if (textInput.editId) {
      if (val) store.updateAnnotation(textInput.editId, { text: val })
      else store.deleteSelected()
    } else if (val) {
      const worldX = (textInput.x - pan.x) / zoom
      const worldY = (textInput.y - pan.y) / zoom
      store.addAnnotation({ id: uid(), type: "text", x: worldX, y: worldY, width: 0, height: 0, text: val, fontSize, color, strokeWidth })
    }
    setTextInput(null)
    store.setTool("select")
  }

  // ── Export / save ──────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!img) return
    store.setSelectedId(null)
    const url = renderToDataUrl(img, annotations, { crop })
    if (url) onSave(url)
  }

  const fileBase = () => (metadata.title.trim() || "screenshot").replace(/[^\w-]+/g, "_")

  const handleExport = async (fmt: ExportFormat) => {
    if (!img) return
    store.setSelectedId(null)
    if (fmt === "png") {
      downloadDataUrl(renderToDataUrl(img, annotations, { crop }), `${fileBase()}.png`)
    } else if (fmt === "jpg") {
      downloadDataUrl(renderToDataUrl(img, annotations, { crop, mimeType: "image/jpeg", quality: 0.92 }), `${fileBase()}.jpg`)
    } else if (fmt === "clipboard") {
      try {
        const blob = dataUrlToBlob(renderToDataUrl(img, annotations, { crop }))
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        store.announce("Copied image to clipboard")
      } catch {
        store.announce("Clipboard copy failed")
      }
    } else if (fmt === "pdf") {
      setExportingPdf(true)
      try {
        const blob = await exportPdf(img, annotations, crop, metadata)
        const url = URL.createObjectURL(blob)
        downloadDataUrl(url, `${fileBase()}.pdf`)
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      } finally {
        setExportingPdf(false)
      }
    } else if (fmt === "json") {
      const url = exportJson(annotations, metadata, crop)
      downloadDataUrl(url, `${fileBase()}.json`)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
  }

  const handleUploadCompare = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setCompareSrc(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleShare = async () => {
    if (!img) return
    setSharing(true)
    setShareUrl(null)
    try {
      store.setSelectedId(null)
      const imageDataUrl = renderToDataUrl(img, annotations, { crop })
      const res = await fetch("/api/annotation-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, title: metadata.title, metadata }),
      })
      const d = await res.json()
      if (res.ok && d.url) {
        const abs = typeof window !== "undefined" ? `${window.location.origin}${d.url}` : d.url
        setShareUrl(abs)
        store.announce("Share link created")
        try { await navigator.clipboard.writeText(abs) } catch {}
      } else {
        store.announce(d.error || "Share failed")
      }
    } catch {
      store.announce("Share failed")
    } finally {
      setSharing(false)
    }
  }

  // ── Drag / transform sync back to the model ────────────────────────────────
  const onNodeDragEnd = (a: Annotation, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    if (a.points) {
      // points-based (arrow/line/freehand): bake the node offset into points.
      const dx = node.x()
      const dy = node.y()
      const pts = a.points.map((v, i) => v + (i % 2 === 0 ? dx : dy))
      node.position({ x: 0, y: 0 })
      store.updateAnnotation(a.id, { points: pts })
    } else {
      store.updateAnnotation(a.id, { x: node.x(), y: node.y() })
    }
  }

  const onNodeTransformEnd = (a: Annotation, e: Konva.KonvaEventObject<Event>) => {
    const node = e.target as Konva.Node
    const sx = node.scaleX()
    const sy = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)
    if (a.type === "text") {
      store.updateAnnotation(a.id, {
        x: node.x(),
        y: node.y(),
        fontSize: Math.max(8, Math.round((a.fontSize || 26) * sx)),
        rotation: node.rotation(),
      })
    } else if (a.type === "ellipse") {
      // Ellipse node origin is its CENTER — convert back to a top-left box.
      const newW = Math.max(4, a.width * sx)
      const newH = Math.max(4, a.height * sy)
      store.updateAnnotation(a.id, {
        x: node.x() - newW / 2,
        y: node.y() - newH / 2,
        width: newW,
        height: newH,
        rotation: node.rotation(),
      })
    } else {
      store.updateAnnotation(a.id, {
        x: node.x(),
        y: node.y(),
        width: Math.max(4, a.width * sx),
        height: Math.max(4, a.height * sy),
        rotation: node.rotation(),
      })
    }
  }

  const draggable = tool === "select"

  // ── Minimap geometry ───────────────────────────────────────────────────────
  const minimap = useMemo(() => {
    if (!img) return null
    const MM_W = 168
    const scale = MM_W / img.naturalWidth
    const mmH = img.naturalHeight * scale
    // Visible region in image coords.
    const viewX = -pan.x / zoom
    const viewY = -pan.y / zoom
    const viewW = stageSize.w / zoom
    const viewH = stageSize.h / zoom
    const zoomedBiggerThanView = img.naturalWidth * zoom > stageSize.w + 4 || img.naturalHeight * zoom > stageSize.h + 4
    return {
      scale, MM_W, mmH,
      rect: {
        x: Math.max(0, viewX * scale),
        y: Math.max(0, viewY * scale),
        w: Math.min(MM_W, viewW * scale),
        h: Math.min(mmH, viewH * scale),
      },
      visible: zoomedBiggerThanView,
    }
  }, [img, pan, zoom, stageSize])

  const onMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!img || !minimap) return
    const r = e.currentTarget.getBoundingClientRect()
    const imgX = (e.clientX - r.left) / minimap.scale
    const imgY = (e.clientY - r.top) / minimap.scale
    // Center the view on the clicked image point.
    setPan({ x: stageSize.w / 2 - imgX * zoom, y: stageSize.h / 2 - imgY * zoom })
  }

  const selected = annotations.find((a) => a.id === selectedId) || null

  // ── Render one annotation as a Konva node ──────────────────────────────────
  const renderNode = (a: Annotation) => {
    const common = {
      id: a.id,
      key: a.id,
      draggable: draggable && !a.locked,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (tool === "select") { e.cancelBubble = true; store.setSelectedId(a.id) }
      },
      onDragStart: () => store.commit(),
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onNodeDragEnd(a, e),
      onTransformStart: () => store.commit(),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onNodeTransformEnd(a, e),
    }
    if (a.type === "rect") {
      return <Rect {...common} x={a.x} y={a.y} width={a.width} height={a.height} rotation={a.rotation || 0} stroke={a.color} strokeWidth={a.strokeWidth} />
    }
    if (a.type === "highlight") {
      return <Rect {...common} x={a.x} y={a.y} width={a.width} height={a.height} rotation={a.rotation || 0} stroke={a.color} strokeWidth={Math.max(1.5, a.strokeWidth / 2)} fill={a.color} opacity={0.25} />
    }
    if (a.type === "ellipse") {
      return <Ellipse {...common} x={a.x + a.width / 2} y={a.y + a.height / 2} radiusX={Math.abs(a.width / 2)} radiusY={Math.abs(a.height / 2)} rotation={a.rotation || 0} stroke={a.color} strokeWidth={a.strokeWidth}
        onDragEnd={(e) => { const n = e.target; store.updateAnnotation(a.id, { x: n.x() - a.width / 2, y: n.y() - a.height / 2 }) }} />
    }
    if (a.type === "blur") {
      return <BlurNode key={a.id} a={a} img={img!} common={common} />
    }
    if (a.type === "text") {
      return <KText {...common} x={a.x} y={a.y} text={a.text || ""} fontSize={a.fontSize || 26} fontStyle="bold" fill={a.color}
        onDblClick={() => setTextInput({ x: a.x * zoom + pan.x, y: a.y * zoom + pan.y, value: a.text || "", editId: a.id })} />
    }
    if (a.type === "arrow") {
      const pts = a.points || [a.x, a.y, a.x + a.width, a.y + a.height]
      return <Arrow {...common} points={pts} stroke={a.color} strokeWidth={a.strokeWidth} fill={a.color} pointerLength={Math.max(12, a.strokeWidth * 3.5)} pointerWidth={Math.max(12, a.strokeWidth * 3)} />
    }
    if (a.type === "line") {
      return <Line {...common} points={a.points || [a.x, a.y, a.x + a.width, a.y + a.height]} stroke={a.color} strokeWidth={a.strokeWidth} lineCap="round" hitStrokeWidth={Math.max(10, a.strokeWidth + 8)} />
    }
    if (a.type === "freehand") {
      return <Line {...common} points={a.points || []} stroke={a.color} strokeWidth={a.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} hitStrokeWidth={Math.max(10, a.strokeWidth + 8)} />
    }
    if (a.type === "pixelate") {
      return <PixelateNode key={a.id} a={a} img={img!} common={common} />
    }
    if (a.type === "number") {
      const r = 16 + a.strokeWidth * 2
      return (
        <Group {...common} x={a.x} y={a.y}>
          <Circle radius={r} fill={a.color} />
          <KText text={String(a.badge ?? 1)} fontSize={r} fontStyle="bold" fill="#ffffff" width={r * 2} height={r * 2} offsetX={r} offsetY={r} align="center" verticalAlign="middle" listening={false} />
        </Group>
      )
    }
    if (a.type === "sticker") {
      const def = stickerByKey(a.sticker)
      const fs = a.fontSize || 30
      if (def.kind === "emoji") {
        return <KText {...common} x={a.x} y={a.y} text={def.label} fontSize={fs * 1.6} />
      }
      return (
        <Group {...common} x={a.x} y={a.y}>
          <StickerBadge label={def.label} color={def.color || a.color} fs={fs} />
        </Group>
      )
    }
    if (a.type === "measure") {
      const label = `${Math.round(a.width)} × ${Math.round(a.height)} px`
      const fs = Math.max(14, a.strokeWidth * 4 + 10)
      return (
        <Fragment key={a.id}>
          <Rect {...common} x={a.x} y={a.y} width={a.width} height={a.height} rotation={a.rotation || 0} stroke={a.color} strokeWidth={a.strokeWidth} />
          <KText x={a.x} y={a.y - fs * 1.5 < 0 ? a.y + 4 : a.y - fs * 1.5} text={label} fontSize={fs} fontStyle="bold" fill={a.color} listening={false} />
        </Fragment>
      )
    }
    if (a.type === "spotlight") {
      return (
        <Fragment key={a.id}>
          <SpotlightMask img={img!} a={a} />
          <Rect {...common} x={a.x} y={a.y} width={a.width} height={a.height} rotation={a.rotation || 0} stroke="#facc15" strokeWidth={Math.max(2, a.strokeWidth)} dash={[8, 4]} />
        </Fragment>
      )
    }
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card text-card-foreground border shadow-[0_8px_24px_rgba(0,0,0,0.08)] rounded-xl w-full max-w-6xl overflow-hidden flex flex-col h-[90vh]">
        {/* aria-live announcements for screen readers */}
        <div aria-live="polite" className="sr-only">{announcement}</div>

        {/* ── Toolbar ── */}
        <div className="border-b px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={store.toggleToolbar}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label={toolbarCollapsed ? "Expand toolbar" : "Collapse toolbar"}
              title={toolbarCollapsed ? "Expand toolbar" : "Collapse toolbar"}
            >
              {toolbarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-0.5 bg-muted/60 border p-1 rounded-lg flex-wrap">
              {TOOLS.map((t, i) => (
                <Fragment key={t.id}>
                  {i > 0 && TOOLS[i - 1].group !== t.group && <span className="w-px h-5 bg-border mx-0.5" aria-hidden />}
                  <button
                    onClick={() => store.setTool(t.id)}
                    aria-label={`${t.label} (${t.key})`}
                    aria-pressed={tool === t.id}
                    title={`${t.label} · ${t.key}`}
                    className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                      tool === t.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-background"
                    }`}
                  >
                    <t.icon className="h-4 w-4" />
                  </button>
                </Fragment>
              ))}
            </div>
          </div>

          {!toolbarCollapsed && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => store.setColor(c)}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    title={c}
                    className={`w-5 h-5 rounded-full border transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "border-border"}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Size</span>
                <input type="range" min={2} max={16} value={strokeWidth} onChange={(e) => store.setStrokeWidth(Number(e.target.value))} className="w-16 accent-indigo-600" aria-label="Stroke width" />
              </div>

              {/* Contextual: text size — shown when the text tool is active or a
                  text label is selected, so labels can be sized before/after typing. */}
              {(tool === "text" || selected?.type === "text") && (
                <div className="flex items-center gap-2 border-l pl-2">
                  <Type className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <input
                    type="range"
                    min={12}
                    max={96}
                    step={2}
                    value={selected?.type === "text" ? selected.fontSize || fontSize : fontSize}
                    onChange={(e) => store.setFontSize(Number(e.target.value))}
                    className="w-20 accent-indigo-600"
                    aria-label="Text size"
                    title="Text size"
                  />
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-6">
                    {selected?.type === "text" ? selected.fontSize || fontSize : fontSize}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {([["S", 18], ["M", 26], ["L", 40]] as const).map(([label, size]) => (
                      <button
                        key={label}
                        onClick={() => store.setFontSize(size)}
                        className={`h-6 w-6 rounded-md border text-[11px] font-bold ${
                          (selected?.type === "text" ? selected.fontSize || fontSize : fontSize) === size
                            ? "bg-primary text-white border-primary"
                            : "bg-background text-muted-foreground"
                        }`}
                        title={`${label} (${size}px)`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Contextual: sticker picker */}
              {tool === "sticker" && (
                <div className="flex items-center gap-1 border-l pl-2">
                  {STICKERS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => store.setSticker(s.key)}
                      title={s.label}
                      className={`h-7 rounded-md border text-[10px] font-semibold px-1.5 flex items-center transition-colors ${
                        sticker === s.key ? "ring-2 ring-primary" : ""
                      } ${s.kind === "badge" ? "text-white" : "bg-background"}`}
                      style={s.kind === "badge" ? { backgroundColor: s.color } : undefined}
                    >
                      {s.kind === "emoji" ? <span className="text-base leading-none">{s.label}</span> : s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Contextual: magnifier power */}
              {tool === "magnifier" && (
                <div className="flex items-center gap-1 border-l pl-2">
                  {MAGNIFIER_POWERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => store.setMagnifierPower(p)}
                      className={`h-7 px-2.5 rounded-md border text-xs font-semibold ${magnifierPower === p ? "bg-primary text-white" : "bg-background text-muted-foreground"}`}
                    >
                      {p}×
                    </button>
                  ))}
                </div>
              )}

              {/* Contextual: crop aspect ratio */}
              {tool === "crop" && (
                <div className="flex items-center gap-1 border-l pl-2">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.key}
                      onClick={() => setCropAspect(ar.ratio)}
                      className={`h-7 px-2 rounded-md border text-[11px] font-semibold ${cropAspect === ar.ratio ? "bg-primary text-white" : "bg-background text-muted-foreground"}`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" disabled={undoStack.length === 0} onClick={store.undo} className="h-8 w-8" aria-label="Undo" title="Undo (⌘Z)"><Undo2 className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon" disabled={redoStack.length === 0} onClick={store.redo} className="h-8 w-8" aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon" disabled={!selectedId} onClick={store.duplicateSelected} className="h-8 w-8" aria-label="Duplicate" title="Duplicate (⌘D)"><Copy className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon" disabled={!selectedId} onClick={store.deleteSelected} className="h-8 w-8 text-red-600 disabled:text-muted-foreground" aria-label="Delete" title="Delete (⌫)"><Trash2 className="h-3.5 w-3.5" /></Button>
                {crop && <Button variant="outline" onClick={() => store.setCrop(null)} className="h-8 px-2 text-xs" title="Clear crop">Clear crop</Button>}
              </div>
            </div>
          )}
        </div>

        {/* ── Body: canvas + info panel ── */}
        <div className="flex-1 min-h-0 flex">
        <div ref={wrapRef} className="flex-1 min-h-0 relative bg-muted/40 dark:bg-black/40 overflow-hidden">
          {img && (
            <Stage
              ref={stageRef}
              width={stageSize.w}
              height={stageSize.h}
              scaleX={zoom}
              scaleY={zoom}
              x={pan.x}
              y={pan.y}
              onMouseDown={onStageMouseDown}
              onMouseMove={onStageMouseMove}
              onMouseUp={onStageMouseUp}
              onMouseLeave={() => { setLens(null); onStageMouseUp() }}
              style={{ cursor: tool === "select" ? "default" : tool === "magnifier" ? "none" : "crosshair" }}
            >
              <Layer listening={false}>
                <KImage image={img} id="bg" width={img.naturalWidth} height={img.naturalHeight} />
              </Layer>
              <Layer ref={layerRef}>
                {annotations.map(renderNode)}
                {draft && renderNode(draft)}
                <Transformer ref={trRef} rotateEnabled ignoreStroke keepRatio={false} anchorSize={9} borderStroke="#6366f1" anchorStroke="#6366f1" anchorCornerRadius={2} />
              </Layer>
              {(crop || cropDraft) && (
                <Layer listening={false}>
                  <CropMask img={img} rect={cropDraft || crop!} />
                </Layer>
              )}
            </Stage>
          )}

          {/* Floating text input */}
          {textInput && (
            <div className="absolute z-20 flex items-center gap-1.5 bg-card border p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] rounded-lg" style={{ left: textInput.x, top: textInput.y }}>
              <input
                autoFocus
                value={textInput.value}
                onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextInput(null) }}
                placeholder="Label text…"
                className="border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary w-48"
              />
              <Button onClick={commitText} size="icon" className="bg-primary hover:bg-primary/90 text-white h-8 w-8"><Check className="h-4 w-4" /></Button>
              <Button onClick={() => setTextInput(null)} variant="ghost" size="icon" className="h-8 w-8"><X className="h-4 w-4" /></Button>
            </div>
          )}

          {/* Magnifier lens — circular loupe that follows the cursor (2x/4x) */}
          {tool === "magnifier" && lens && img && (
            <div
              className="absolute rounded-full border-2 border-primary shadow-[0_8px_24px_rgba(0,0,0,0.08)] pointer-events-none z-30 overflow-hidden"
              style={{
                left: lens.sx - 70,
                top: lens.sy - 70,
                width: 140,
                height: 140,
                backgroundImage: `url(${imageSrc})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${img.naturalWidth * magnifierPower}px ${img.naturalHeight * magnifierPower}px`,
                backgroundPosition: `${-(lens.imgX * magnifierPower - 70)}px ${-(lens.imgY * magnifierPower - 70)}px`,
              }}
            >
              <span className="absolute bottom-1 right-1 text-[9px] font-black text-white bg-black/60 rounded px-1">{magnifierPower}×</span>
            </div>
          )}

          {/* Minimap */}
          {minimap && minimap.visible && (
            <div
              onClick={onMinimapClick}
              className="absolute bottom-3 right-3 z-20 border-2 border-border rounded-md overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.06)] cursor-pointer bg-card"
              style={{ width: minimap.MM_W, height: minimap.mmH }}
              title="Click to navigate"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc} alt="" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
              <div className="absolute border-2 border-primary bg-primary/10 pointer-events-none" style={{ left: minimap.rect.x, top: minimap.rect.y, width: minimap.rect.w, height: minimap.rect.h }} />
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 bg-card border rounded-lg shadow-md px-1 py-0.5">
            <button onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" aria-label="Zoom out (−1%)" title="Zoom out (−1%)"><ZoomOut className="h-4 w-4" /></button>
            <input
              value={zoomText}
              onChange={(e) => setZoomText(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { commitZoomText(); (e.target as HTMLInputElement).blur() } }}
              onBlur={commitZoomText}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              aria-label="Zoom percentage"
              className="w-9 text-[11px] font-semibold text-center tabular-nums bg-transparent outline-none focus:bg-muted rounded"
            />
            <span className="text-[11px] font-semibold text-muted-foreground pr-1">%</span>
            <button onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" aria-label="Zoom in (+1%)" title="Zoom in (+1%)"><ZoomIn className="h-4 w-4" /></button>
            <button onClick={fitToScreen} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Fit to screen" title="Fit to screen (0)"><Maximize className="h-3.5 w-3.5" /></button>
          </div>

          {/* Before/After comparison overlay */}
          {compareSrc && <CompareSlider beforeSrc={imageSrc} afterSrc={compareSrc} onClose={() => setCompareSrc(null)} />}
        </div>

        {showPanel && (
          <InfoPanel
            metadata={metadata}
            setMetadata={setMetadata}
            onExport={handleExport}
            onUploadCompare={handleUploadCompare}
            onShare={handleShare}
            sharing={sharing}
            shareUrl={shareUrl}
            exportingPdf={exportingPdf}
          />
        )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Draw to annotate · Select to move/resize/rotate · Ctrl+Scroll to zoom · Crop keeps only the selected region on save
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPanel((p) => !p)}
              className="h-9 w-9 flex items-center justify-center rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label={showPanel ? "Hide info panel" : "Show info panel"}
              title={showPanel ? "Hide info panel" : "Show info panel"}
            >
              {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
            <Button variant="outline" onClick={onCancel} disabled={saving} className="h-9 px-4">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !img} className="h-9 px-5 bg-primary hover:bg-primary/90 text-white flex items-center gap-1.5">
              <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save Screenshot"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Real Gaussian blur region: a cropped, cached copy of the source with a blur
// filter (hides sensitive data in the editor, matching the export).
function BlurNode({ a, img, common }: { a: Annotation; img: HTMLImageElement; common: any }) {
  const ref = useRef<Konva.Image | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || a.width < 1 || a.height < 1) return
    node.cache()
    node.getLayer()?.batchDraw()
  }, [a.x, a.y, a.width, a.height, img])
  return (
    <KImage
      {...common}
      ref={ref}
      image={img}
      x={a.x}
      y={a.y}
      width={Math.max(1, a.width)}
      height={Math.max(1, a.height)}
      crop={{ x: a.x, y: a.y, width: Math.max(1, a.width), height: Math.max(1, a.height) }}
      filters={[Konva.Filters.Blur]}
      blurRadius={14}
    />
  )
}

// Pixelate region: cropped + cached copy of the source with the Pixelate filter.
function PixelateNode({ a, img, common }: { a: Annotation; img: HTMLImageElement; common: any }) {
  const ref = useRef<Konva.Image | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || a.width < 1 || a.height < 1) return
    node.cache()
    node.getLayer()?.batchDraw()
  }, [a.x, a.y, a.width, a.height, a.strokeWidth, img])
  return (
    <KImage
      {...common}
      ref={ref}
      image={img}
      x={a.x}
      y={a.y}
      width={Math.max(1, a.width)}
      height={Math.max(1, a.height)}
      crop={{ x: a.x, y: a.y, width: Math.max(1, a.width), height: Math.max(1, a.height) }}
      filters={[Konva.Filters.Pixelate]}
      pixelSize={Math.max(6, a.strokeWidth * 2)}
    />
  )
}

// QA sticker badge (rounded pill + label). Width is estimated for display; the
// export renderer measures text precisely.
function StickerBadge({ label, color, fs }: { label: string; color: string; fs: number }) {
  const padX = fs * 0.5
  const boxH = fs * 1.5
  const textW = label.length * fs * 0.6
  const boxW = textW + padX * 2
  return (
    <>
      <Rect width={boxW} height={boxH} cornerRadius={boxH / 2} fill={color} />
      <KText text={label} fontSize={fs} fontStyle="bold" fill="#ffffff" x={padX} height={boxH} verticalAlign="middle" listening={false} />
    </>
  )
}

// Spotlight: darken everything except the annotation's box (scrim only; the
// selectable outline is drawn separately in renderNode).
function SpotlightMask({ img, a }: { img: HTMLImageElement; a: Annotation }) {
  const x = Math.min(a.x, a.x + a.width)
  const y = Math.min(a.y, a.y + a.height)
  const w = Math.abs(a.width)
  const h = Math.abs(a.height)
  return (
    <>
      <Rect x={0} y={0} width={img.naturalWidth} height={y} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={0} y={y + h} width={img.naturalWidth} height={img.naturalHeight - (y + h)} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={0} y={y} width={x} height={h} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={x + w} y={y} width={img.naturalWidth - (x + w)} height={h} fill="rgba(0,0,0,0.55)" listening={false} />
    </>
  )
}

// Dark scrim over everything except the crop region, with a rule-of-thirds grid.
function CropMask({ img, rect }: { img: HTMLImageElement; rect: CropRect }) {
  const x = Math.min(rect.x, rect.x + rect.width)
  const y = Math.min(rect.y, rect.y + rect.height)
  const w = Math.abs(rect.width)
  const h = Math.abs(rect.height)
  return (
    <>
      <Rect x={0} y={0} width={img.naturalWidth} height={y} fill="rgba(0,0,0,0.45)" />
      <Rect x={0} y={y + h} width={img.naturalWidth} height={img.naturalHeight - (y + h)} fill="rgba(0,0,0,0.45)" />
      <Rect x={0} y={y} width={x} height={h} fill="rgba(0,0,0,0.45)" />
      <Rect x={x + w} y={y} width={img.naturalWidth - (x + w)} height={h} fill="rgba(0,0,0,0.45)" />
      {/* rule-of-thirds guides */}
      <Line points={[x + w / 3, y, x + w / 3, y + h]} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      <Line points={[x + (2 * w) / 3, y, x + (2 * w) / 3, y + h]} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      <Line points={[x, y + h / 3, x + w, y + h / 3]} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      <Line points={[x, y + (2 * h) / 3, x + w, y + (2 * h) / 3]} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      <Rect x={x} y={y} width={w} height={h} stroke="#6366f1" strokeWidth={2} dash={[6, 4]} />
    </>
  )
}
