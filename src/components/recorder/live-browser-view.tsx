"use client"

import { useEffect, useRef, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"

/**
 * Embedded live view of a recorder-worker browser session: renders the CDP
 * screencast (WebSocket, Chromium) with a REST frame-polling fallback, and
 * forwards mouse/keyboard/wheel input to the remote page.
 *
 * Extracted from the Live QA session page so Recorder Studio can embed the
 * browser too — required wherever the worker runs on a server (production)
 * and a native headed window can't be shown.
 */
export function LiveBrowserView({
  sessionId,
  browserType = "Chromium",
  active,
  className = "",
}: {
  sessionId: string
  browserType?: string
  active: boolean
  className?: string
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [hasFrame, setHasFrame] = useState(false)
  const hasFrameRef = useRef(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mode, setMode] = useState<"connecting" | "streaming" | "polling">("connecting")
  const modeRef = useRef(mode)
  modeRef.current = mode

  const streamDsfRef = useRef(1)
  const frameDsfRef = useRef(1)
  const lastObjectUrlRef = useRef<string | null>(null)
  const frameBusyRef = useRef(false)
  const lastMoveSentRef = useRef(0)
  const inputQueueRef = useRef<Promise<unknown>>(Promise.resolve())

  function paint(src: string, dsf: number) {
    frameDsfRef.current = dsf
    if (imgRef.current) imgRef.current.src = src
    if (!hasFrameRef.current) {
      hasFrameRef.current = true
      setHasFrame(true)
    }
  }

  function drawFrameBlob(blob: Blob) {
    const url = URL.createObjectURL(blob)
    if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current)
    lastObjectUrlRef.current = url
    paint(url, streamDsfRef.current)
  }

  async function fetchLiveFrame() {
    if (frameBusyRef.current) return
    frameBusyRef.current = true
    try {
      const res = await fetch(`/api/recording/${sessionId}/frame`)
      if (res.ok) {
        const data = await res.json()
        if (data.frame) paint(data.frame, 1) // polling frames are CSS px
      }
    } catch {
      // transient — next poll retries
    } finally {
      frameBusyRef.current = false
    }
  }

  function sendInput(payload: Record<string, unknown>) {
    if (!active) return
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload))
        return
      } catch {}
    }
    inputQueueRef.current = inputQueueRef.current
      .then(() =>
        fetch(`/api/recording/${sessionId}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
      .then(() => {
        if (modeRef.current !== "streaming") fetchLiveFrame()
      })
      .catch(() => {})
  }

  // REST polling — fallback whenever the WS stream isn't delivering frames.
  useEffect(() => {
    if (!active || mode === "streaming") return
    fetchLiveFrame()
    const t = setInterval(fetchLiveFrame, 350)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, active, mode])

  // CDP screencast over WebSocket (Chromium only), with retry → polling.
  useEffect(() => {
    if (!active) return
    if (browserType !== "Chromium") {
      setMode("polling")
      return
    }
    let cancelled = false
    let ws: WebSocket | null = null
    let retryTimer: any = null
    let attempt = 0

    async function connect() {
      if (cancelled) return
      try {
        const res = await fetch(`/api/recording/${sessionId}/stream-token`, { method: "POST" })
        if (!res.ok) throw new Error("token")
        const data = await res.json()
        if (cancelled) return
        ws = new WebSocket(data.wsUrl)
        ws.binaryType = "blob"
        wsRef.current = ws
        ws.onopen = () => { attempt = 0 }
        ws.onmessage = (ev) => {
          if (typeof ev.data === "string") {
            try {
              const msg = JSON.parse(ev.data)
              if (msg.type === "mode") {
                if (msg.mode === "streaming") setMode("streaming")
                if (msg.mode === "polling") {
                  cancelled = true
                  setMode("polling")
                }
              } else if (msg.type === "dsf" && msg.dsf) {
                streamDsfRef.current = Number(msg.dsf) || 1
              }
            } catch {}
          } else {
            drawFrameBlob(ev.data as Blob)
          }
        }
        ws.onclose = () => {
          wsRef.current = null
          if (cancelled) return
          setMode("polling")
          attempt++
          retryTimer = setTimeout(connect, Math.min(8000, 1000 * 2 ** Math.min(attempt, 3)))
        }
        ws.onerror = () => { try { ws?.close() } catch {} }
      } catch {
        if (cancelled) return
        setMode("polling")
        attempt++
        retryTimer = setTimeout(connect, Math.min(8000, 1000 * 2 ** Math.min(attempt, 3)))
      }
    }

    setMode("connecting")
    connect()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      wsRef.current = null
      try { ws?.close() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, active, browserType])

  // Revoke the last frame object URL on unmount.
  useEffect(
    () => () => {
      if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current)
    },
    []
  )

  // Native fullscreen on the wrapper — input keeps working since the same
  // element (and its handlers) fills the screen; keyboard capture actually
  // improves because the wrapper holds focus.
  function toggleFullscreen() {
    const el = wrapperRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === wrapperRef.current
      setIsFullscreen(fs)
      if (fs) wrapperRef.current?.focus()
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Map a mouse event on the scaled <img> back to remote CSS-px coordinates.
  function coords(e: { clientX: number; clientY: number }) {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return null
    const rect = img.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const dsf = frameDsfRef.current || 1
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * (img.naturalWidth / dsf)),
      y: Math.round(((e.clientY - rect.top) / rect.height) * (img.naturalHeight / dsf)),
    }
  }

  const MOUSE_BUTTONS: Record<number, string> = { 0: "left", 1: "middle", 2: "right" }

  function mapKeyboardEvent(e: React.KeyboardEvent): string | null {
    if (e.key === "Control" || e.key === "Meta" || e.key === "Alt" || e.key === "Shift") return null
    const key = e.key === " " ? "Space" : e.key
    const mods: string[] = []
    if (e.ctrlKey) mods.push("Control")
    if (e.metaKey) mods.push("Meta")
    if (e.altKey) mods.push("Alt")
    if (e.shiftKey && key.length > 1) mods.push("Shift")
    return [...mods, key].join("+")
  }

  // Wheel: non-passive native listener, deltas coalesced per animation frame.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    let accX = 0
    let accY = 0
    let raf = 0
    let lastCoords: { x: number; y: number } | null = null

    const flush = () => {
      raf = 0
      if (accX === 0 && accY === 0) return
      const dx = accX
      const dy = accY
      accX = 0
      accY = 0
      if (lastCoords) sendInput({ type: "wheel", ...lastCoords, deltaX: Math.round(dx), deltaY: Math.round(dy) })
    }
    function onWheel(ev: WheelEvent) {
      ev.preventDefault()
      const c = coords(ev)
      if (c) lastCoords = c
      accX += ev.deltaX
      accY += ev.deltaY
      if (!raf) raf = requestAnimationFrame(flush)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
      if (raf) cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, active])

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className={`group relative flex items-center justify-center overflow-hidden bg-slate-950 outline-none ${
        isFullscreen ? "h-screen w-screen" : className
      }`}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!hasFrame) return
        const key = mapKeyboardEvent(e)
        if (key) {
          e.preventDefault()
          sendInput({ type: "keypress", key })
        }
      }}
    >
      {/* Fullscreen toggle */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/70 text-slate-200 opacity-0 backdrop-blur transition-opacity hover:bg-slate-900 group-hover:opacity-100 focus:opacity-100"
        title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <img
        ref={imgRef}
        alt="Live browser view"
        className={`block h-auto max-h-full w-auto max-w-full select-none cursor-default ${hasFrame ? "" : "hidden"}`}
        draggable={false}
        onMouseDown={(e) => {
          wrapperRef.current?.focus()
          const c = coords(e)
          if (c) sendInput({ type: "mousedown", ...c, button: MOUSE_BUTTONS[e.button] || "left" })
        }}
        onMouseMove={(e) => {
          const now = Date.now()
          if (now - lastMoveSentRef.current < 40) return
          lastMoveSentRef.current = now
          const c = coords(e)
          if (c) sendInput({ type: "mousemove", ...c })
        }}
        onMouseUp={(e) => {
          const c = coords(e)
          if (c) sendInput({ type: "mouseup", ...c, button: MOUSE_BUTTONS[e.button] || "left" })
        }}
      />
      {!hasFrame && (
        <div className="p-12 text-center text-xs text-muted-foreground">
          {active ? "Connecting to the recording browser…" : "Session paused."}
        </div>
      )}
      {!active && hasFrame && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <span className="rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Session paused
          </span>
        </div>
      )}
    </div>
  )
}
