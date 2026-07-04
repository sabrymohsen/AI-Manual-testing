"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
} from "lucide-react"

/**
 * Object-based screenshot annotation editor (Live QA Session).
 *
 * Unlike the legacy ScreenshotAnnotator (which rasterizes each stroke
 * immediately), annotations here are kept as objects until save, so they can
 * be selected, moved, deleted, and un/re-done. Export renders at the image's
 * natural resolution — display scaling is CSS-only.
 */

type Tool = "select" | "rect" | "highlight" | "circle" | "arrow" | "text" | "blur" | "crop"

interface Annotation {
  id: string
  type: "rect" | "highlight" | "circle" | "arrow" | "text" | "blur"
  // Image-space coordinates. For text, (x1,y1) anchors the label.
  x1: number
  y1: number
  x2: number
  y2: number
  text?: string
  color: string
  size: number
}

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

interface Snapshot {
  annotations: Annotation[]
  crop: CropRect | null
}

interface AnnotationEditorProps {
  imageSrc: string
  onSave: (annotatedDataUrl: string) => void
  onCancel: () => void
  saving?: boolean
}

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#000000"]

// Text size presets → annotation.size (font px = size * 4 + 14)
const TEXT_SIZES = [
  { label: "S", value: 2 },
  { label: "M", value: 4 },
  { label: "L", value: 7 },
]

const uid = () => Math.random().toString(36).slice(2, 10)

export function AnnotationEditor({ imageSrc, onSave, onCancel, saving }: AnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  const [tool, setTool] = useState<Tool>("rect")
  const [color, setColor] = useState(COLORS[0])
  const [stroke, setStroke] = useState(4)
  // Text label size (independent of shape stroke width): S/M/L presets
  const [textSize, setTextSize] = useState(4)

  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [undoStack, setUndoStack] = useState<Snapshot[]>([])
  const [redoStack, setRedoStack] = useState<Snapshot[]>([])

  // In-progress drawing (image coords)
  const draftRef = useRef<Annotation | null>(null)
  const cropDraftRef = useRef<CropRect | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; orig: Annotation } | null>(null)
  const [, forceRender] = useState(0)
  const repaint = () => forceRender((n) => n + 1)

  // Floating text input (image coords for anchor)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null)

  // ── Image load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = imageSrc
    img.onload = () => {
      imgRef.current = img
      setImgLoaded(true)
    }
  }, [imageSrc])

  // ── History ────────────────────────────────────────────────────────────────
  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev, { annotations: annotations.map((a) => ({ ...a })), crop: crop ? { ...crop } : null }])
    setRedoStack([])
  }, [annotations, crop])

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setRedoStack((r) => [...r, { annotations: annotations.map((a) => ({ ...a })), crop: crop ? { ...crop } : null }])
      setAnnotations(last.annotations)
      setCrop(last.crop)
      setSelectedId(null)
      return prev.slice(0, -1)
    })
  }, [annotations, crop])

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setUndoStack((u) => [...u, { annotations: annotations.map((a) => ({ ...a })), crop: crop ? { ...crop } : null }])
      setAnnotations(last.annotations)
      setCrop(last.crop)
      setSelectedId(null)
      return prev.slice(0, -1)
    })
  }, [annotations, crop])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    pushUndo()
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, pushUndo])

  // Keyboard: delete / undo / redo / escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (textDraft) return // typing in the label input
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault()
          deleteSelected()
        }
      } else if (e.key === "Escape") {
        setSelectedId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleUndo, handleRedo, deleteSelected, selectedId, textDraft])

  // ── Geometry helpers ───────────────────────────────────────────────────────
  const toImageCoords = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const norm = (a: Annotation) => ({
    x: Math.min(a.x1, a.x2),
    y: Math.min(a.y1, a.y2),
    w: Math.abs(a.x2 - a.x1),
    h: Math.abs(a.y2 - a.y1),
  })

  const textMetrics = (ctx: CanvasRenderingContext2D, a: Annotation) => {
    const fontSize = a.size * 4 + 14
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
    const width = ctx.measureText(a.text || "").width
    const padX = fontSize * 0.45
    const padY = fontSize * 0.3
    return { fontSize, boxW: width + padX * 2, boxH: fontSize + padY * 2, padX, padY }
  }

  const hitTest = (x: number, y: number): Annotation | null => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return null
    const tolerance = 8
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i]
      if (a.type === "text") {
        const { boxW, boxH } = textMetrics(ctx, a)
        if (x >= a.x1 && x <= a.x1 + boxW && y >= a.y1 && y <= a.y1 + boxH) return a
      } else if (a.type === "arrow") {
        // distance from point to segment
        const dx = a.x2 - a.x1
        const dy = a.y2 - a.y1
        const len2 = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((x - a.x1) * dx + (y - a.y1) * dy) / len2))
        const px = a.x1 + t * dx
        const py = a.y1 + t * dy
        if (Math.hypot(x - px, y - py) <= tolerance + a.size) return a
      } else {
        const { x: rx, y: ry, w, h } = norm(a)
        const inside = x >= rx - tolerance && x <= rx + w + tolerance && y >= ry - tolerance && y <= ry + h + tolerance
        if (a.type === "highlight" || a.type === "blur") {
          if (inside) return a
        } else if (inside) {
          // rect/circle: near border OR inside for easier grabbing
          return a
        }
      }
    }
    return null
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  const drawAnnotation = (ctx: CanvasRenderingContext2D, a: Annotation, img: HTMLImageElement) => {
    ctx.save()
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = a.size

    if (a.type === "rect") {
      const { x, y, w, h } = norm(a)
      ctx.strokeRect(x, y, w, h)
    } else if (a.type === "highlight") {
      const { x, y, w, h } = norm(a)
      ctx.globalAlpha = 0.25
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
      ctx.lineWidth = Math.max(1.5, a.size / 2)
      ctx.strokeRect(x, y, w, h)
    } else if (a.type === "circle") {
      const { x, y, w, h } = norm(a)
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (a.type === "arrow") {
      const head = Math.max(12, a.size * 3.5)
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1)
      ctx.beginPath()
      ctx.moveTo(a.x1, a.y1)
      ctx.lineTo(a.x2, a.y2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(a.x2, a.y2)
      ctx.lineTo(a.x2 - head * Math.cos(angle - Math.PI / 6), a.y2 - head * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(a.x2 - head * Math.cos(angle + Math.PI / 6), a.y2 - head * Math.sin(angle + Math.PI / 6))
      ctx.closePath()
      ctx.fill()
    } else if (a.type === "text") {
      const { fontSize, boxW, boxH, padX, padY } = textMetrics(ctx, a)
      const r = 6
      ctx.beginPath()
      ctx.roundRect(a.x1, a.y1, boxW, boxH, r)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textBaseline = "top"
      ctx.fillText(a.text || "", a.x1 + padX, a.y1 + padY)
    } else if (a.type === "blur") {
      const { x, y, w, h } = norm(a)
      if (w > 2 && h > 2) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.clip()
        ctx.filter = "blur(14px)"
        ctx.drawImage(img, 0, 0)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  const drawScene = useCallback(
    (ctx: CanvasRenderingContext2D, opts: { forExport: boolean }) => {
      const img = imgRef.current
      if (!img) return
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.drawImage(img, 0, 0)

      const list = draftRef.current ? [...annotations, draftRef.current] : annotations
      for (const a of list) drawAnnotation(ctx, a, img)

      if (!opts.forExport) {
        // Selection outline
        const sel = annotations.find((a) => a.id === selectedId)
        if (sel) {
          let bx: number, by: number, bw: number, bh: number
          if (sel.type === "text") {
            const m = textMetrics(ctx, sel)
            bx = sel.x1; by = sel.y1; bw = m.boxW; bh = m.boxH
          } else {
            const n = norm(sel)
            bx = n.x; by = n.y; bw = n.w; bh = n.h
          }
          ctx.save()
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8)
          ctx.restore()
        }

        // Crop overlay (pending crop applied at save)
        const c = cropDraftRef.current || crop
        if (c && c.w > 2 && c.h > 2) {
          ctx.save()
          ctx.fillStyle = "rgba(0,0,0,0.45)"
          ctx.beginPath()
          ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
          ctx.rect(c.x, c.y, c.w, c.h)
          ctx.fill("evenodd")
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.strokeRect(c.x, c.y, c.w, c.h)
          ctx.restore()
        }
      }
    },
    [annotations, selectedId, crop]
  )

  // Repaint whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return
    if (canvas.width !== img.naturalWidth) {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
    }
    const ctx = canvas.getContext("2d")
    if (ctx) drawScene(ctx, { forExport: false })
  })

  // ── Mouse handling ─────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textDraft) return
    const { x, y } = toImageCoords(e)

    if (tool === "select") {
      const hit = hitTest(x, y)
      setSelectedId(hit?.id || null)
      if (hit) {
        dragRef.current = { id: hit.id, startX: x, startY: y, orig: { ...hit } }
      }
      return
    }

    if (tool === "text") {
      // Grab an existing text box to drag it; empty space places a new one
      const hit = hitTest(x, y)
      if (hit && hit.type === "text") {
        setSelectedId(hit.id)
        dragRef.current = { id: hit.id, startX: x, startY: y, orig: { ...hit } }
        return
      }
      setTextDraft({ x, y, value: "" })
      return
    }

    if (tool === "crop") {
      cropDraftRef.current = { x, y, w: 0, h: 0 }
      repaint()
      return
    }

    draftRef.current = {
      id: uid(),
      type: tool as Annotation["type"],
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      color,
      size: stroke,
    }
    repaint()
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toImageCoords(e)

    if (dragRef.current) {
      const { id, startX, startY, orig } = dragRef.current
      const dx = x - startX
      const dy = y - startY
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy } : a))
      )
      return
    }
    if (cropDraftRef.current) {
      const c = cropDraftRef.current
      cropDraftRef.current = { ...c, w: x - c.x, h: y - c.y }
      repaint()
      return
    }
    if (draftRef.current) {
      draftRef.current = { ...draftRef.current, x2: x, y2: y }
      repaint()
    }
  }

  const handleMouseUp = () => {
    if (dragRef.current) {
      const moved = annotations.find((a) => a.id === dragRef.current!.id)
      const orig = dragRef.current.orig
      dragRef.current = null
      if (moved && (moved.x1 !== orig.x1 || moved.y1 !== orig.y1)) {
        // Record the pre-move state for undo
        setUndoStack((prev) => [
          ...prev,
          {
            annotations: annotations.map((a) => (a.id === orig.id ? { ...orig } : { ...a })),
            crop: crop ? { ...crop } : null,
          },
        ])
        setRedoStack([])
      }
      return
    }

    if (cropDraftRef.current) {
      const c = cropDraftRef.current
      cropDraftRef.current = null
      const normalized: CropRect = {
        x: Math.min(c.x, c.x + c.w),
        y: Math.min(c.y, c.y + c.h),
        w: Math.abs(c.w),
        h: Math.abs(c.h),
      }
      if (normalized.w > 10 && normalized.h > 10) {
        pushUndo()
        setCrop(normalized)
      }
      repaint()
      return
    }

    if (draftRef.current) {
      const d = draftRef.current
      draftRef.current = null
      const big = Math.abs(d.x2 - d.x1) > 4 || Math.abs(d.y2 - d.y1) > 4
      if (big) {
        pushUndo()
        setAnnotations((prev) => [...prev, d])
        setSelectedId(d.id)
      }
      repaint()
    }
  }

  const commitTextDraft = () => {
    if (!textDraft || !textDraft.value.trim()) {
      setTextDraft(null)
      return
    }
    pushUndo()
    const ann: Annotation = {
      id: uid(),
      type: "text",
      x1: textDraft.x,
      y1: textDraft.y,
      x2: textDraft.x,
      y2: textDraft.y,
      text: textDraft.value.trim(),
      color,
      size: textSize,
    }
    setAnnotations((prev) => [...prev, ann])
    setSelectedId(ann.id)
    setTextDraft(null)
    // Switch to Select so the freshly placed label can be dragged right away
    setTool("select")
  }

  // ── #4: font size control for text labels ──
  const selectedAnnotation = annotations.find((a) => a.id === selectedId) || null
  const selectedIsText = selectedAnnotation?.type === "text"
  const activeTextSize = selectedIsText ? selectedAnnotation!.size : textSize

  function applyTextSize(value: number) {
    setTextSize(value)
    if (selectedIsText && selectedAnnotation && selectedAnnotation.size !== value) {
      pushUndo()
      setAnnotations((prev) => prev.map((a) => (a.id === selectedAnnotation.id ? { ...a, size: value } : a)))
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const img = imgRef.current
    if (!img) return
    const full = document.createElement("canvas")
    full.width = img.naturalWidth
    full.height = img.naturalHeight
    const ctx = full.getContext("2d")
    if (!ctx) return
    drawScene(ctx, { forExport: true })

    if (crop && crop.w > 10 && crop.h > 10) {
      const cropped = document.createElement("canvas")
      cropped.width = Math.round(crop.w)
      cropped.height = Math.round(crop.h)
      const cctx = cropped.getContext("2d")
      if (!cctx) return
      cctx.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
      onSave(cropped.toDataURL("image/png"))
      return
    }
    onSave(full.toDataURL("image/png"))
  }

  // Position of the floating text input in display space
  const textInputStyle = (): React.CSSProperties => {
    const canvas = canvasRef.current
    if (!canvas || !textDraft) return { display: "none" }
    const rect = canvas.getBoundingClientRect()
    const parentRect = canvas.parentElement?.getBoundingClientRect()
    const scaleX = rect.width / canvas.width
    const scaleY = rect.height / canvas.height
    return {
      position: "absolute",
      left: (parentRect ? rect.left - parentRect.left : 0) + textDraft.x * scaleX,
      top: (parentRect ? rect.top - parentRect.top : 0) + textDraft.y * scaleY,
    }
  }

  const tools: Array<{ id: Tool; icon: any; label: string }> = [
    { id: "select", icon: MousePointer2, label: "Select" },
    { id: "rect", icon: Square, label: "Rectangle" },
    { id: "highlight", icon: Highlighter, label: "Highlight" },
    { id: "circle", icon: CircleIcon, label: "Ellipse" },
    { id: "arrow", icon: ArrowUpRight, label: "Arrow" },
    { id: "text", icon: Type, label: "Text" },
    { id: "blur", icon: EyeOff, label: "Blur" },
    { id: "crop", icon: Crop, label: "Crop" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border shadow-2xl rounded-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[88vh] animate-in fade-in zoom-in-95 duration-200">

        {/* Toolbar */}
        <div className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 bg-muted/60 border p-1 rounded-lg">
            {tools.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant={tool === t.id ? "default" : "ghost"}
                onClick={() => setTool(t.id)}
                className="px-2.5 h-8 text-xs font-medium rounded-md flex items-center gap-1.5"
                title={t.label}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    color === c ? "ring-2 ring-offset-2 ring-indigo-400 scale-110" : "border-border"
                  }`}
                  title={c}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Size</span>
              <input
                type="range"
                min="2"
                max="10"
                value={stroke}
                onChange={(e) => setStroke(Number(e.target.value))}
                className="w-16 h-1 bg-muted rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {(tool === "text" || textDraft || selectedIsText) && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">Text</span>
                {TEXT_SIZES.map((ts) => (
                  <button
                    key={ts.label}
                    type="button"
                    onClick={() => applyTextSize(ts.value)}
                    className={`h-7 w-7 rounded-md border text-xs font-semibold transition-colors ${
                      activeTextSize === ts.value
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    title={`${ts.label === "S" ? "Small" : ts.label === "M" ? "Medium" : "Large"} text`}
                  >
                    {ts.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" disabled={undoStack.length === 0} onClick={handleUndo} className="h-8 w-8" title="Undo (⌘Z)">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon" disabled={redoStack.length === 0} onClick={handleRedo} className="h-8 w-8" title="Redo (⇧⌘Z)">
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon" disabled={!selectedId} onClick={deleteSelected} className="h-8 w-8 text-red-600 disabled:text-muted-foreground" title="Delete selected (⌫)">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {crop && (
                <Button type="button" variant="outline" onClick={() => { pushUndo(); setCrop(null) }} className="h-8 px-2 text-xs" title="Remove pending crop">
                  Clear crop
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-muted/40 p-6 relative">
          <div className="relative w-fit mx-auto">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`border shadow-lg bg-white rounded-lg max-w-full h-auto ${
                tool === "select" ? "cursor-default" : "cursor-crosshair"
              }`}
              style={{ maxHeight: "calc(88vh - 180px)" }}
            />

            {textDraft && (
              <div style={textInputStyle()} className="z-10 flex items-center gap-1.5 bg-card border p-1.5 shadow-xl rounded-lg">
                <input
                  type="text"
                  value={textDraft.value}
                  onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                  placeholder="Label text..."
                  autoFocus
                  className="border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTextDraft()
                    if (e.key === "Escape") setTextDraft(null)
                  }}
                />
                <Button type="button" onClick={commitTextDraft} size="icon" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 w-8">
                  <Check className="h-4 w-4" />
                </Button>
                <Button type="button" onClick={() => setTextDraft(null)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Draw to annotate · Select to move or delete · Crop keeps only the selected region on save
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="h-9 px-4">
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || !imgLoaded} className="h-9 px-5 bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5">
              <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save Screenshot"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
