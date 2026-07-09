"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

/**
 * GitHub-style before/after image comparison. The "after" image is clipped to a
 * draggable vertical divider so you can wipe between the two screenshots.
 */
export function CompareSlider({ beforeSrc, afterSrc, onClose }: { beforeSrc: string; afterSrc: string; onClose: () => void }) {
  const [pos, setPos] = useState(50) // divider position, 0–100 %
  const ref = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const setFromClientX = useCallback((clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pct = ((clientX - r.left) / r.width) * 100
    setPos(Math.min(100, Math.max(0, pct)))
  }, [])

  useEffect(() => {
    const move = (e: MouseEvent) => dragging.current && setFromClientX(e.clientX)
    const up = () => (dragging.current = false)
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
  }, [setFromClientX])

  return (
    <div className="absolute inset-0 z-30 bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 text-white/90">
        <span className="text-xs font-black uppercase tracking-wide">Before / After comparison</span>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/10" aria-label="Close comparison">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 select-none">
        <div ref={ref} className="relative max-w-full max-h-full inline-block" style={{ touchAction: "none" }}>
          {/* before (full) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeSrc} alt="Before" className="block max-w-full max-h-[75vh] w-auto h-auto pointer-events-none" draggable={false} />
          <span className="absolute top-2 left-2 text-[10px] font-black uppercase bg-black/60 text-white px-1.5 py-0.5 rounded">Before</span>
          {/* after (clipped to divider) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={afterSrc} alt="After" className="block max-w-full max-h-[75vh] w-auto h-auto" draggable={false} />
            <span className="absolute top-2 right-2 text-[10px] font-black uppercase bg-black/60 text-white px-1.5 py-0.5 rounded">After</span>
          </div>
          {/* divider handle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize"
            style={{ left: `${pos}%` }}
            onMouseDown={(e) => { dragging.current = true; setFromClientX(e.clientX) }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-700 text-xs font-black">↔</div>
          </div>
        </div>
      </div>
    </div>
  )
}
