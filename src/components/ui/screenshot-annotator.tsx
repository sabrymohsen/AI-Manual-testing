"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Undo2, Square, Type, ArrowUpRight, Circle, Crop, Move, Sparkles, X, Check, EyeOff } from "@/components/ui/icons"

interface ScreenshotAnnotatorProps {
  imageSrc: string
  onSave: (annotatedDataUrl: string) => void
  onCancel: () => void
}

type Tool = "select" | "rect" | "arrow" | "circle" | "text" | "blur" | "crop"

export function ScreenshotAnnotator({ imageSrc, onSave, onCancel }: ScreenshotAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [tool, setTool] = useState<Tool>("rect")
  const [color, setColor] = useState("#ef4444") // default red
  const [lineWidth, setLineWidth] = useState(4)
  const [history, setHistory] = useState<string[]>([])
  
  // Text input helper
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInputValue, setTextInputValue] = useState("")
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 })

  // Drawing state
  const isDrawing = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const bgImage = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = imageSrc
    img.onload = () => {
      bgImage.current = img
      initCanvas(img)
    }
  }, [imageSrc])

  const initCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Limit maximum dimensions but preserve aspect ratio
    const maxDim = 800
    let w = img.width
    let h = img.height
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = (maxDim / w) * h
        w = maxDim
      } else {
        w = (maxDim / h) * w
        h = maxDim
      }
    }

    canvas.width = w
    canvas.height = h
    ctx.drawImage(img, 0, 0, w, h)
    saveToHistory()
  }

  const saveToHistory = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL()
    setHistory((prev) => [...prev, dataUrl])
  }

  const handleUndo = () => {
    if (history.length <= 1) return
    const newHistory = [...history]
    newHistory.pop() // remove current state
    const prevState = newHistory[newHistory.length - 1]
    setHistory(newHistory)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const img = new Image()
    img.src = prevState
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
    }
  }

  // Draw arrow head
  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headLength = 15
    const angle = Math.atan2(toY - fromY, toX - fromX)
    
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    // Account for styling scaling
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCoordinates(e)
    startX.current = coords.x
    startY.current = coords.y
    isDrawing.current = true

    if (tool === "text") {
      setShowTextInput(true)
      setTextPosition({ x: coords.x, y: coords.y })
      setTextInputValue("")
      isDrawing.current = false
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || history.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const coords = getCoordinates(e)
    const currentX = coords.x
    const currentY = coords.y

    // Clear canvas and draw previous saved state
    const img = new Image()
    img.src = history[history.length - 1]
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.fillStyle = color

      if (tool === "rect") {
        ctx.strokeRect(startX.current, startY.current, currentX - startX.current, currentY - startY.current)
      } else if (tool === "circle") {
        ctx.beginPath()
        const r = Math.sqrt(Math.pow(currentX - startX.current, 2) + Math.pow(currentY - startY.current, 2))
        ctx.arc(startX.current, startY.current, r, 0, 2 * Math.PI)
        ctx.stroke()
      } else if (tool === "arrow") {
        drawArrow(ctx, startX.current, startY.current, currentX, currentY)
      } else if (tool === "blur") {
        // Blur drawing preview (draw translucent black rectangle)
        ctx.save()
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
        ctx.fillRect(startX.current, startY.current, currentX - startX.current, currentY - startY.current)
        ctx.strokeStyle = "#ffffff"
        ctx.setLineDash([5, 5])
        ctx.strokeRect(startX.current, startY.current, currentX - startX.current, currentY - startY.current)
        ctx.restore()
      } else if (tool === "crop") {
        // Crop box indicator selection
        ctx.save()
        ctx.strokeStyle = "#3b82f6"
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.strokeRect(startX.current, startY.current, currentX - startX.current, currentY - startY.current)
        ctx.fillStyle = "rgba(59, 130, 246, 0.05)"
        ctx.fillRect(startX.current, startY.current, currentX - startX.current, currentY - startY.current)
        ctx.restore()
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    isDrawing.current = false

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const coords = getCoordinates(e)
    const currentX = coords.x
    const currentY = coords.y

    if (tool === "blur") {
      // Apply native Canvas filter blur to selected region
      const x = Math.min(startX.current, currentX)
      const y = Math.min(startY.current, currentY)
      const w = Math.abs(currentX - startX.current)
      const h = Math.abs(currentY - startY.current)
      
      if (w > 5 && h > 5) {
        ctx.save()
        ctx.filter = "blur(12px)"
        ctx.drawImage(canvas, x, y, w, h, x, y, w, h)
        ctx.restore()
        saveToHistory()
      }
    } else if (tool === "crop") {
      // Execute crop action
      const x = Math.min(startX.current, currentX)
      const y = Math.min(startY.current, currentY)
      const w = Math.abs(currentX - startX.current)
      const h = Math.abs(currentY - startY.current)

      if (w > 10 && h > 10) {
        const croppedCanvas = document.createElement("canvas")
        croppedCanvas.width = w
        croppedCanvas.height = h
        const croppedCtx = croppedCanvas.getContext("2d")
        if (croppedCtx) {
          croppedCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h)
          canvas.width = w
          canvas.height = h
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(croppedCanvas, 0, 0)
          saveToHistory()
        }
      }
      setTool("rect") // switch back
    } else if (tool !== "text") {
      saveToHistory()
    }
  }

  const handleApplyText = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !textInputValue) return

    ctx.fillStyle = color
    ctx.font = `bold ${lineWidth * 4 + 12}px Inter, sans-serif`
    ctx.fillText(textInputValue, textPosition.x, textPosition.y)
    
    setShowTextInput(false)
    setTextInputValue("")
    saveToHistory()
  }

  const handleSaveAnnotated = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(canvas.toDataURL("image/png"))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Editor Header Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl">
            <Button
              type="button"
              variant={tool === "rect" ? "default" : "ghost"}
              onClick={() => setTool("rect")}
              className="px-3 py-2 h-8 text-xs font-semibold rounded-lg flex items-center gap-1"
            >
              <Square size={14} /> Rectangle
            </Button>
            <Button
              type="button"
              variant={tool === "arrow" ? "default" : "ghost"}
              onClick={() => setTool("arrow")}
              className="px-3 py-2 h-8 text-xs font-semibold rounded-lg flex items-center gap-1"
            >
              <ArrowUpRight size={14} /> Arrow
            </Button>
            <Button
              type="button"
              variant={tool === "circle" ? "default" : "ghost"}
              onClick={() => setTool("circle")}
              className="px-3 py-2 h-8 text-xs font-semibold rounded-lg flex items-center gap-1"
            >
              <Circle size={14} /> Circle
            </Button>
            <Button
              type="button"
              variant={tool === "text" ? "default" : "ghost"}
              onClick={() => setTool("text")}
              className="px-3 py-2 h-8 text-xs font-semibold rounded-lg flex items-center gap-1"
            >
              <Type size={14} /> Text
            </Button>
            <Button
              type="button"
              variant={tool === "blur" ? "default" : "ghost"}
              onClick={() => setTool("blur")}
              className="px-3 py-2 h-8 text-xs font-semibold rounded-lg flex items-center gap-1 text-slate-700"
            >
              <EyeOff size={14} /> Blur Sensitive
            </Button>
            <Button
              type="button"
              variant={tool === "crop" ? "default" : "ghost"}
              onClick={() => setTool("crop")}
              className="px-3 py-2 h-8 text-xs font-semibold rounded-lg flex items-center gap-1"
            >
              <Crop size={14} /> Crop
            </Button>
          </div>

          <div className="flex items-center gap-4">
            {/* Color picker */}
            <div className="flex items-center gap-1">
              {["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#000000"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border ${color === c ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "border-slate-300"}`}
                />
              ))}
            </div>

            {/* Line width */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Size:</span>
              <input
                type="range"
                min="2"
                max="10"
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Undo */}
            <Button
              type="button"
              variant="outline"
              disabled={history.length <= 1}
              onClick={handleUndo}
              className="h-8 py-2 px-3 border-slate-200 rounded-lg flex items-center gap-1 hover:bg-slate-100 disabled:opacity-50"
            >
              <Undo2 size={14} /> Undo
            </Button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto bg-slate-100 p-8 flex items-center justify-center relative">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="border border-slate-300 shadow-lg bg-white cursor-crosshair rounded-lg"
          />

          {/* Text Input dialog popover */}
          {showTextInput && (
            <div
              className="absolute bg-white border border-slate-200 p-2 shadow-xl rounded-xl z-10 flex items-center gap-2"
              style={{
                left: `${Math.min(textPosition.x + 30, 700)}px`,
                top: `${Math.min(textPosition.y + 30, 450)}px`
              }}
            >
              <input
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                placeholder="Type annotation..."
                autoFocus
                className="border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyText()
                  if (e.key === "Escape") setShowTextInput(false)
                }}
              />
              <Button onClick={handleApplyText} size="sm" className="bg-blue-600 text-white rounded-lg p-1 h-8 w-8 flex items-center justify-center">
                <Check size={16} />
              </Button>
              <Button onClick={() => setShowTextInput(false)} variant="ghost" size="sm" className="text-slate-400 p-1 h-8 w-8 flex items-center justify-center rounded-lg">
                <X size={16} />
              </Button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 px-6">
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveAnnotated} className=" bg-green-600 text-white font-semibold rounded-xl px-6 shadow-md flex items-center gap-2">
            <Check size={18} /> Apply & Save Screenshot
          </Button>
        </div>

      </div>
    </div>
  )
}
