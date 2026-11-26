"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Search,
  Camera,
  Video,
  FileText,
  Network,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Tag,
  Plus,
  LayoutGrid,
  ListVideo,
  Film,
  FolderOpen,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Image as ImageIcon,
  ScrollText,
  Eye,
  EyeOff,
  MousePointerClick,
  ArrowDownToLine,
  Radio,
  Crosshair
} from "@/components/ui/icons"

// ---------- Types ----------

interface EvidenceItem {
  id: string
  testExecutionId: string
  fileType: string
  filePath: string
  stepNumber: number
  pageUrl: string
  elementLocator: string
  status: string
  tags: string[]
  createdAt: string
  testName?: string
  scriptType?: string | null
  executionStatus?: string | null
  executionDuration?: number | null
  browser?: string | null
  lineCount?: number | null
  fileExists?: boolean
}

interface EvidenceDetail {
  evidence: EvidenceItem
  prevId: string | null
  nextId: string | null
  stepIndex: number
  stepTotal: number
}

interface TimelineExecution {
  id: string
  testName: string
  scriptType: string | null
  status: string
  browser: string | null
  duration: number | null
  createdAt: string
  evidenceCount: number
}

// ---------- Helpers ----------

const TYPE_META: Record<string, { icon: any; label: string }> = {
  screenshot: { icon: Camera, label: "Screenshot" },
  gif: { icon: ImageIcon, label: "GIF" },
  video: { icon: Video, label: "Video" },
  log: { icon: FileText, label: "Log" },
  har: { icon: Network, label: "HAR" }
}

const STATUS_META: Record<string, { icon: any; label: string; className: string }> = {
  pass: { icon: CheckCircle2, label: "PASS", className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  fail: { icon: XCircle, label: "FAIL", className: "bg-rose-50 text-rose-700 border-rose-100" },
  flaky: { icon: AlertTriangle, label: "FLAKY", className: "bg-amber-50 text-amber-700 border-amber-100" },
  info: { icon: Info, label: "INFO", className: "bg-muted/50 text-muted-foreground border-border" }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Lightweight JSON syntax highlighting for the log/HAR viewers
function highlightJson(raw: string): string {
  const escaped = escapeHtml(raw)
  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-amber-300" // number
      if (match.startsWith('"')) {
        cls = match.endsWith(":") ? "text-indigo-300 font-semibold" : "text-emerald-300"
      } else if (/true|false/.test(match)) {
        cls = "text-purple-300"
      } else if (match === "null") {
        cls = "text-rose-300"
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

const StatusBadge = ({ status, small = false }: { status: string; small?: boolean }) => {
  const meta = STATUS_META[status] || STATUS_META.info
  const Icon = meta.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase ${meta.className} ${
        small ? "px-2 py-px text-xs" : "px-2 py-0.5 text-xs"
      }`}
    >
      <Icon size={small ? 9 : 10} /> {meta.label}
    </span>
  )
}

// ---------- Media viewer (shared by detail modal + timeline) ----------

function EvidenceMedia({ item, large = false }: { item: EvidenceItem; large?: boolean }) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState(false)
  const [harEntryIdx, setHarEntryIdx] = useState(0)

  const isText = item.fileType === "log" || item.fileType === "har"

  useEffect(() => {
    setTextContent(null)
    setHarEntryIdx(0)
    if (!isText) return
    setLoadingText(true)
    fetch(`/api/hub/evidence/${item.id}/file`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setTextContent)
      .catch(() => setTextContent(null))
      .finally(() => setLoadingText(false))
  }, [item.id, isText])

  if (item.fileType === "screenshot") {
    return item.fileExists ? <ScreenshotHighlighter item={item} large={large} /> : <MissingFile />
  }

  if (item.fileType === "gif") {
    return item.fileExists ? <GifPlayer item={item} large={large} /> : <MissingFile />
  }

  if (item.fileType === "video") {
    return item.fileExists ? (
      <video
        src={`/api/hub/evidence/${item.id}/file`}
        controls
        className={`w-full bg-slate-950 rounded-xl ${large ? "max-h-[52vh]" : "max-h-[40vh]"}`}
      />
    ) : (
      <MissingFile />
    )
  }

  if (loadingText) {
    return (
      <div className="h-48 flex items-center justify-center bg-slate-950 rounded-xl">
        <Loader2 size={18} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (textContent === null) return <MissingFile />

  // HAR: parsed request/response walkthrough
  if (item.fileType === "har") {
    let har: any = null
    try {
      har = JSON.parse(textContent)
    } catch {}
    const entries = har?.log?.entries
    if (Array.isArray(entries) && entries.length > 0) {
      const entry = entries[Math.min(harEntryIdx, entries.length - 1)]
      return (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {entries.slice(0, 30).map((e: any, i: number) => (
              <button
                key={i}
                onClick={() => setHarEntryIdx(i)}
                className={`shrink-0 px-2 py-1 rounded-lg border text-xs font-semibold font-mono ${
                  i === harEntryIdx ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {e.request?.method} {String(e.response?.status || "")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="bg-slate-950 rounded-xl p-3 space-y-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Request</span>
                <span className="text-xs font-mono font-semibold text-indigo-300">{entry.request?.method}</span>
              </div>
              <p className="font-mono text-xs text-slate-300 break-all">{entry.request?.url}</p>
              <pre
                className="font-mono text-xs leading-relaxed overflow-auto max-h-40 text-slate-200"
                dangerouslySetInnerHTML={{
                  __html: highlightJson(JSON.stringify({ headers: entry.request?.headers, postData: entry.request?.postData }, null, 2))
                }}
              />
            </div>
            <div className="bg-slate-950 rounded-xl p-3 space-y-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Response</span>
                <span className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-semibold ${Number(entry.response?.status) < 400 ? "text-emerald-300" : "text-rose-300"}`}>
                    {entry.response?.status}
                  </span>
                  <span className="text-xs font-mono text-amber-300 font-semibold">{Math.round(entry.time || 0)}ms</span>
                </span>
              </div>
              <pre
                className="font-mono text-xs leading-relaxed overflow-auto max-h-44 text-slate-200"
                dangerouslySetInnerHTML={{
                  __html: highlightJson(
                    JSON.stringify({ headers: entry.response?.headers, content: entry.response?.content?.text?.slice(0, 2000) }, null, 2)
                  )
                }}
              />
            </div>
          </div>
        </div>
      )
    }
  }

  // Plain log (or unparseable HAR) — highlight if it looks like JSON
  const looksJson = /^\s*[{[]/.test(textContent)
  return (
    <pre
      className={`font-mono text-xs leading-relaxed bg-slate-950 text-slate-200 rounded-xl p-3 overflow-auto whitespace-pre-wrap ${
        large ? "max-h-[52vh]" : "max-h-[40vh]"
      }`}
      {...(looksJson
        ? { dangerouslySetInnerHTML: { __html: highlightJson(textContent) } }
        : { children: textContent })}
    />
  )
}

const MissingFile = () => (
  <div className="h-40 flex flex-col items-center justify-center gap-2 bg-muted border rounded-xl text-muted-foreground">
    <FolderOpen size={18} />
    <span className="text-xs font-medium">File missing on disk</span>
  </div>
)

// ---------- Animated GIF player ----------
// SHAFT can stitch a run's screenshots into an animated GIF (createAnimatedGif).
// Native <img> GIFs can't be paused or retimed, so when the browser exposes the
// WebCodecs ImageDecoder API we decode every frame up-front and render them to a
// canvas on our own clock — giving real play/pause, speed and frame scrubbing.
// Browsers without ImageDecoder fall back to a plain animated <img>.

const GIF_SPEEDS = [0.25, 0.5, 1, 2, 4]

function GifPlayer({ item, large = false }: { item: EvidenceItem; large?: boolean }) {
  const src = `/api/hub/evidence/${item.id}/file`
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const framesRef = useRef<{ bitmap: ImageBitmap; duration: number }[]>([])
  const idxRef = useRef(0)
  const accRef = useRef(0)
  const playingRef = useRef(true)
  const speedRef = useRef(1)

  const [ready, setReady] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [frameCount, setFrameCount] = useState(0)
  const [displayIdx, setDisplayIdx] = useState(0)

  playingRef.current = playing
  speedRef.current = speed

  const draw = useCallback((i: number) => {
    const canvas = canvasRef.current
    const frame = framesRef.current[i]
    if (!canvas || !frame) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    if (canvas.width !== frame.bitmap.width) {
      canvas.width = frame.bitmap.width
      canvas.height = frame.bitmap.height
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(frame.bitmap, 0, 0)
  }, [])

  // Decode every frame once
  useEffect(() => {
    let cancelled = false
    const AnyWindow = typeof window !== "undefined" ? (window as any) : null
    if (!AnyWindow || typeof AnyWindow.ImageDecoder === "undefined") {
      setFallback(true)
      return
    }
    ;(async () => {
      try {
        const resp = await fetch(src)
        if (!resp.ok) throw new Error("fetch failed")
        const buffer = await resp.arrayBuffer()
        const decoder = new AnyWindow.ImageDecoder({ data: buffer, type: "image/gif" })
        await decoder.tracks.ready
        const track = decoder.tracks.selectedTrack
        const count = track?.frameCount ?? 1
        const built: { bitmap: ImageBitmap; duration: number }[] = []
        for (let i = 0; i < count; i++) {
          const { image } = await decoder.decode({ frameIndex: i })
          const bitmap = await createImageBitmap(image)
          // VideoFrame.duration is in microseconds; default ~100ms when absent
          const durationMs = image.duration ? image.duration / 1000 : 100
          built.push({ bitmap, duration: Math.max(20, durationMs) })
          image.close?.()
        }
        if (cancelled) {
          built.forEach((f) => f.bitmap.close?.())
          return
        }
        framesRef.current = built
        setFrameCount(built.length)
        setReady(true)
      } catch {
        if (!cancelled) setFallback(true)
      }
    })()
    return () => {
      cancelled = true
      framesRef.current.forEach((f) => f.bitmap.close?.())
      framesRef.current = []
    }
  }, [src])

  // Draw the first frame as soon as decoding finishes
  useEffect(() => {
    if (ready) draw(0)
  }, [ready, draw])

  // Playback clock — subscribes once, reads live values from refs
  useEffect(() => {
    if (!ready) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const frames = framesRef.current
      if (playingRef.current && frames.length > 1) {
        accRef.current += (now - last) * speedRef.current
        let cur = frames[idxRef.current]
        let advanced = false
        let guard = 0
        while (cur && accRef.current >= cur.duration && guard < frames.length + 1) {
          accRef.current -= cur.duration
          idxRef.current = (idxRef.current + 1) % frames.length
          cur = frames[idxRef.current]
          advanced = true
          guard++
        }
        if (advanced) {
          draw(idxRef.current)
          setDisplayIdx(idxRef.current)
        }
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, draw])

  const scrubTo = (i: number) => {
    idxRef.current = i
    accRef.current = 0
    setDisplayIdx(i)
    draw(i)
  }

  const maxH = large ? "max-h-[52vh]" : "max-h-[40vh]"

  if (error) return <MissingFile />

  // Fallback: native animated GIF (no frame-level control available)
  if (fallback) {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Animated GIF — ${item.testName || "run"}`}
          onError={() => setError(true)}
          className={`w-full object-contain bg-slate-950 rounded-xl ${maxH}`}
        />
        <div className="flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <ImageIcon size={10} /> Animated GIF · native playback
          </span>
          <a
            href={`/api/hub/evidence/${item.id}/download`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary"
          >
            <Download size={11} /> GIF
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className={`relative bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center ${maxH}`}>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-indigo-400" />
          </div>
        )}
        <canvas ref={canvasRef} className={`w-full object-contain ${maxH}`} />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-black/60 text-white text-xs font-medium rounded-full px-2 py-0.5">
          <ImageIcon size={9} /> GIF
        </span>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2 bg-muted/50 border rounded-xl px-3 py-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={!ready}
          className="h-7 w-7 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-white flex items-center justify-center shrink-0"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={() => {
            scrubTo(0)
            setPlaying(true)
          }}
          disabled={!ready}
          className="h-7 w-7 rounded-lg border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 flex items-center justify-center shrink-0"
          title="Restart"
        >
          <RotateCcw size={12} />
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, frameCount - 1)}
          value={displayIdx}
          disabled={!ready}
          onChange={(e) => {
            setPlaying(false)
            scrubTo(Number(e.target.value))
          }}
          className="flex-1 accent-indigo-600 cursor-pointer"
        />
        <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums shrink-0">
          {frameCount ? displayIdx + 1 : 0}/{frameCount}
        </span>

        <div className="flex items-center gap-1 shrink-0 border-l pl-2">
          <Gauge size={11} className="text-muted-foreground" />
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            disabled={!ready}
            className="h-7 rounded-lg border px-2 text-xs font-semibold bg-card cursor-pointer"
          >
            {GIF_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>

        <a
          href={`/api/hub/evidence/${item.id}/download`}
          className="h-7 w-7 rounded-lg border bg-card text-muted-foreground hover:bg-muted flex items-center justify-center shrink-0"
          title="Download GIF"
        >
          <Download size={12} />
        </a>
      </div>
    </div>
  )
}

// ---------- Screenshot highlight / element inspector ----------
// SHAFT bakes a coloured highlight rectangle onto the exact element it acted on,
// directly in the PNG. This overlay adds an interactive inspector layer on top:
// a toggle, a hover tooltip with the locator + action, and a click-through
// details panel — all sourced from the evidence row's real metadata (no
// fabricated coordinates).

function parseLocator(locator: string): { strategy: string; value: string } {
  if (!locator) return { strategy: "auto", value: "" }
  const m = locator.match(/By\.(\w+)\(\s*["'`]?([^"'`]*)["'`]?\s*\)/)
  if (m) {
    const map: Record<string, string> = {
      id: "id",
      name: "name",
      cssSelector: "css",
      className: "class",
      tagName: "tag",
      linkText: "link-text",
      partialLinkText: "partial-link",
      xpath: "xpath"
    }
    return { strategy: map[m[1]] || m[1], value: m[2] }
  }
  if (locator.startsWith("//") || locator.startsWith("(//")) return { strategy: "xpath", value: locator }
  if (/^[.#\[]/.test(locator)) return { strategy: "css", value: locator }
  return { strategy: "custom", value: locator }
}

// Infer the action SHAFT performed from the locator / command text
function inferAction(item: EvidenceItem): string {
  const src = `${item.elementLocator}`.toLowerCase()
  if (/click|tap/.test(src)) return "Click"
  if (/type|sendkeys|fill|input/.test(src)) return "Type text"
  if (/assert|verify|validat/.test(src)) return "Validation"
  if (/hover/.test(src)) return "Hover"
  if (/select|dropdown/.test(src)) return "Select"
  if (/navigat|open|get\(/.test(src)) return "Navigate"
  return "Capture"
}

function ScreenshotHighlighter({ item, large = false }: { item: EvidenceItem; large?: boolean }) {
  const [showHighlights, setShowHighlights] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [hovering, setHovering] = useState(false)

  const src = `/api/hub/evidence/${item.id}/file`
  const maxH = large ? "max-h-[52vh]" : "max-h-[40vh]"
  const loc = parseLocator(item.elementLocator)
  const action = inferAction(item)
  let host = ""
  try {
    host = item.pageUrl ? new URL(item.pageUrl).host : ""
  } catch {}

  return (
    <div className="space-y-2">
      <div className="relative bg-slate-950 rounded-xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Step ${item.stepNumber} screenshot`} className={`w-full object-contain ${maxH}`} />

        {showHighlights && (
          <>
            {/* Element highlight frame + interactive badge */}
            <button
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              onClick={() => setDetailsOpen((v) => !v)}
              className="absolute inset-0 group cursor-crosshair"
              title="Inspect highlighted element"
            >
              <span className="absolute inset-1.5 rounded-lg ring-2 ring-primary/80 group-hover:ring-primary/30 shadow-[0_0_0_9999px_rgba(0,0,0,0)] transition-all pointer-events-none" />
              <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-primary text-white text-xs font-semibold uppercase rounded-md px-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)] pointer-events-none">
                <Crosshair size={10} /> {action}
                {loc.value && <span className="font-mono lowercase opacity-90">· {loc.strategy}</span>}
              </span>
            </button>

            {/* Hover tooltip */}
            {hovering && (
              <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-slate-900/95 text-white rounded-lg px-3 py-2 pointer-events-none space-y-0.5">
                <p className="text-xs font-medium text-indigo-300 flex items-center gap-1">
                  <MousePointerClick size={9} /> {action} · {loc.strategy} locator
                </p>
                <p className="font-mono text-xs break-all text-slate-200">
                  {loc.value || item.pageUrl || "Full-page capture"}
                </p>
                <p className="text-xs text-muted-foreground font-semibold">Click to inspect element details →</p>
              </div>
            )}
          </>
        )}

        {/* Highlight toggle */}
        <button
          onClick={() => setShowHighlights((v) => !v)}
          className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[8.5px] font-semibold uppercase shadow-lg transition-colors ${
            showHighlights ? "bg-white text-indigo-700" : "bg-black/60 text-white"
          }`}
        >
          {showHighlights ? <Eye size={10} /> : <EyeOff size={10} />}
          {showHighlights ? "Highlights on" : "Highlights off"}
        </button>
      </div>

      {/* Element details panel */}
      {detailsOpen && showHighlights && (
        <div className="bg-muted/50 border rounded-xl p-3 space-y-2 text-left">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Crosshair size={11} className="text-primary" /> Element Inspector
            </span>
            <button onClick={() => setDetailsOpen(false)} className="text-muted-foreground hover:text-muted-foreground">
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs font-semibold text-muted-foreground">
            <div>
              <span className="text-muted-foreground text-xs block">Action</span>
              {action}
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Locator strategy</span>
              <span className="font-mono text-primary">{loc.strategy}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs block">Locator value</span>
              <span className="font-mono break-all text-primary">
                {loc.value || "— (element region captured directly)"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs block">Page</span>
              <span className="font-mono break-all">{item.pageUrl || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Host</span>
              <span className="font-mono">{host || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Step / Status</span>
              #{item.stepNumber} · {item.status.toUpperCase()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Execution log viewer ----------
// Streams SHAFT's async log4j output (target/logs/log4j.log) via Server-Sent
// Events so lines appear as they're written, without blocking on the file.

type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR"

const LOG_LEVELS: LogLevel[] = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"]

const LEVEL_STYLE: Record<LogLevel, string> = {
  INFO: "text-sky-300",
  DEBUG: "text-muted-foreground",
  TRACE: "text-purple-300",
  WARN: "text-amber-300",
  ERROR: "text-rose-300"
}

const LEVEL_CHIP: Record<LogLevel, string> = {
  INFO: "bg-sky-500",
  DEBUG: "bg-slate-400",
  TRACE: "bg-purple-500",
  WARN: "bg-amber-500",
  ERROR: "bg-rose-500"
}

interface ParsedLine {
  raw: string
  level: LogLevel
  ts: string | null
  count: number
}

function ExecutionLogViewer() {
  const [rawLines, setRawLines] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const [enabled, setEnabled] = useState<Record<LogLevel, boolean>>({
    TRACE: true,
    DEBUG: true,
    INFO: true,
    WARN: true,
    ERROR: true
  })
  const [search, setSearch] = useState("")
  const [autoScroll, setAutoScroll] = useState(true)
  const [dedup, setDedup] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bufferRef = useRef("")
  const esRef = useRef<EventSource | null>(null)

  const appendChunk = useCallback((text: string) => {
    bufferRef.current += text
    const parts = bufferRef.current.split("\n")
    bufferRef.current = parts.pop() ?? ""
    if (parts.length) {
      setRawLines((prev) => {
        const next = [...prev, ...parts]
        // cap memory — keep the most recent 8000 lines
        return next.length > 8000 ? next.slice(next.length - 8000) : next
      })
    }
  }, [])

  // Initial load + live stream
  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch("/api/hub/logs")
        const d = await res.json()
        if (aborted) return
        setRawLines(d.content ? String(d.content).split("\n") : [])
        setInitialLoading(false)

        const es = new EventSource(`/api/hub/logs/stream?offset=${d.size || 0}`)
        esRef.current = es
        es.addEventListener("append", (e) => {
          try {
            appendChunk(JSON.parse((e as MessageEvent).data))
          } catch {}
        })
        es.addEventListener("reset", () => {
          bufferRef.current = ""
          setRawLines([])
        })
        es.onopen = () => setConnected(true)
        es.onerror = () => setConnected(false)
      } catch {
        setInitialLoading(false)
      }
    })()
    return () => {
      aborted = true
      esRef.current?.close()
    }
  }, [appendChunk])

  // Parse levels (continuation lines inherit the previous line's level) + dedup
  const parsed = useMemo<ParsedLine[]>(() => {
    const out: ParsedLine[] = []
    let prevLevel: LogLevel = "INFO"
    for (const raw of rawLines) {
      const m = raw.match(/^\[(TRACE|DEBUG|INFO|WARN|ERROR)\s*\]/)
      const level = (m ? m[1] : prevLevel) as LogLevel
      prevLevel = level
      const tsMatch = raw.match(/(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+)/)
      if (dedup && out.length > 0 && out[out.length - 1].raw === raw && raw.trim()) {
        out[out.length - 1].count++
      } else {
        out.push({ raw, level, ts: tsMatch ? tsMatch[1] : null, count: 1 })
      }
    }
    return out
  }, [rawLines, dedup])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return parsed.filter((l) => enabled[l.level] && (!q || l.raw.toLowerCase().includes(q)))
  }, [parsed, enabled, search])

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length, autoScroll])

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 }
    for (const l of parsed) c[l.level]++
    return c
  }, [parsed])

  return (
    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap border-b p-3 bg-muted/50">
        <ScrollText size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Execution Logs</span>
        <span
          className={`inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase rounded-full px-2 py-0.5 ${
            connected ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-muted text-muted-foreground border"
          }`}
        >
          <Radio size={9} className={connected ? "animate-pulse" : ""} /> {connected ? "Live" : "Idle"}
        </span>

        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter log lines by keyword..."
            className="w-full h-8 rounded-xl border pl-8 pr-3 text-xs bg-card font-semibold"
          />
        </div>

        <button
          onClick={() => setDedup((v) => !v)}
          className={`h-8 px-2.5 rounded-xl border text-[9px] font-semibold uppercase ${
            dedup ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground"
          }`}
          title="Collapse consecutive duplicate lines"
        >
          Dedup
        </button>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={`h-8 px-2.5 rounded-xl border text-[9px] font-semibold uppercase inline-flex items-center gap-1 ${
            autoScroll ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground"
          }`}
          title="Auto-scroll to newest lines"
        >
          <ArrowDownToLine size={11} /> Auto
        </button>
        <a
          href="/api/hub/logs?download=1"
          className="h-8 px-3 rounded-xl border bg-card text-muted-foreground hover:bg-muted text-xs font-medium inline-flex items-center gap-1"
        >
          <Download size={11} /> Log
        </a>
      </div>

      {/* Level filter chips */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b bg-card">
        {LOG_LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setEnabled((e) => ({ ...e, [lvl]: !e[lvl] }))}
            className={`inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2 py-0.5 text-[8.5px] font-semibold uppercase border transition-all ${
              enabled[lvl] ? "bg-card text-foreground border-border" : "bg-muted/50 text-slate-300 border-border"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${enabled[lvl] ? LEVEL_CHIP[lvl] : "bg-slate-300"}`} />
            {lvl}
            <span className="tabular-nums opacity-60">{counts[lvl]}</span>
          </button>
        ))}
      </div>

      {/* Log body */}
      <div ref={scrollRef} className="bg-slate-950 h-[54vh] overflow-auto p-3 font-mono text-xs leading-relaxed">
        {initialLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-indigo-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileText size={20} />
            <span className="text-xs font-medium">
              {rawLines.length === 0 ? "No log output yet — run a test in the Tests tab" : "No lines match these filters"}
            </span>
          </div>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className="flex gap-2 hover:bg-white/5 px-1 -mx-1 rounded">
              <span className={`shrink-0 w-9 font-semibold ${LEVEL_STYLE[l.level]}`}>{l.level}</span>
              <span className={`whitespace-pre-wrap break-all flex-1 ${LEVEL_STYLE[l.level]}`}>
                {l.raw || " "}
              </span>
              {l.count > 1 && (
                <span className="shrink-0 self-start bg-amber-500/20 text-amber-300 rounded px-1 text-xs font-semibold">
                  ×{l.count}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------- Main component ----------

export default function EvidenceVaultSection({
  initialEvidenceId = null,
  onConsumedInitialEvidence,
  onOpenVideoLab
}: {
  initialEvidenceId?: string | null
  onConsumedInitialEvidence?: () => void
  onOpenVideoLab?: (evidenceId: string) => void
} = {}) {
  const [mode, setMode] = useState<"grid" | "timeline" | "logs">("grid")

  // Filters
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [rangeFilter, setRangeFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Grid data
  const [items, setItems] = useState<EvidenceItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Detail modal
  const [detail, setDetail] = useState<EvidenceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tagInput, setTagInput] = useState("")

  // Timeline mode
  const [executions, setExecutions] = useState<TimelineExecution[]>([])
  const [selectedExecId, setSelectedExecId] = useState("")
  const [timelineSteps, setTimelineSteps] = useState<EvidenceItem[]>([])
  const [timelineExec, setTimelineExec] = useState<TimelineExecution | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [timelineLoading, setTimelineLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(t)
  }, [query])

  const buildParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams()
      params.set("page", String(pageNum))
      if (typeFilter !== "all") params.set("type", typeFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (tagFilter) params.set("tag", tagFilter)
      if (debouncedQuery) params.set("q", debouncedQuery)
      if (rangeFilter !== "all") {
        const hours = rangeFilter === "1h" ? 1 : rangeFilter === "24h" ? 24 : 24 * 7
        params.set("since", new Date(Date.now() - hours * 3_600_000).toISOString())
      }
      return params
    },
    [typeFilter, statusFilter, tagFilter, debouncedQuery, rangeFilter]
  )

  const loadEvidence = useCallback(
    async (pageNum: number, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true)
      try {
        const res = await fetch(`/api/hub/evidence?${buildParams(pageNum)}`)
        if (!res.ok) return
        const d = await res.json()
        setItems((prev) => (append ? [...prev, ...d.evidence] : d.evidence))
        setTotal(d.total)
        setHasMore(d.hasMore)
        setAllTags(d.allTags || [])
        setPage(pageNum)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [buildParams]
  )

  useEffect(() => {
    loadEvidence(1, false)
  }, [loadEvidence])

  // ---------- Detail modal ----------

  // Keyboard navigation while the detail modal is open:
  // Escape closes, ←/→ walk through the execution's steps
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null)
      else if (e.key === "ArrowLeft" && detail.prevId) openDetail(detail.prevId)
      else if (e.key === "ArrowRight" && detail.nextId) openDetail(detail.nextId)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/hub/evidence/${id}`)
      if (res.ok) {
        setDetail(await res.json())
        setTagInput("")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setDetailLoading(false)
    }
  }

  // Deep-link: when the Trace Viewer asks to open a specific evidence file,
  // pop its detail modal and clear the request so it doesn't re-fire.
  useEffect(() => {
    if (!initialEvidenceId) return
    openDetail(initialEvidenceId)
    onConsumedInitialEvidence?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvidenceId])

  const updateTags = async (tags: string[]) => {
    if (!detail) return
    const prev = detail.evidence.tags
    setDetail({ ...detail, evidence: { ...detail.evidence, tags } })
    try {
      const res = await fetch(`/api/hub/evidence/${detail.evidence.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags })
      })
      if (!res.ok) throw new Error()
      setItems((cur) => cur.map((i) => (i.id === detail.evidence.id ? { ...i, tags } : i)))
    } catch {
      setDetail((d) => (d ? { ...d, evidence: { ...d.evidence, tags: prev } } : d))
    }
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || !detail || detail.evidence.tags.includes(t)) return
    updateTags([...detail.evidence.tags, t])
    setTagInput("")
  }

  // ---------- Timeline mode ----------

  useEffect(() => {
    if (mode !== "timeline") return
    fetch("/api/hub/evidence/executions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: TimelineExecution[] = d?.executions || []
        setExecutions(list)
        if (list.length > 0 && !selectedExecId) setSelectedExecId(list[0].id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (mode !== "timeline" || !selectedExecId) return
    setTimelineLoading(true)
    fetch(`/api/hub/executions/${selectedExecId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setTimelineExec(d.execution)
        setTimelineSteps(d.steps || [])
        setStepIdx(0)
      })
      .catch(() => {})
      .finally(() => setTimelineLoading(false))
  }, [mode, selectedExecId])

  const activeStep = timelineSteps[stepIdx] || null

  const formatDuration = (ms: number | null | undefined) =>
    ms === null || ms === undefined ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  // ---------- Render ----------

  return (
    <div className="space-y-4">
      {/* FILTER BAR */}
      <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search test name, page URL, element..."
            className="w-full h-9 rounded-xl border pl-8 pr-3 text-xs bg-muted/50 font-semibold"
          />
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold cursor-pointer">
          <option value="all">All Types</option>
          <option value="screenshot">Screenshots</option>
          <option value="gif">Animated GIFs</option>
          <option value="video">Videos</option>
          <option value="log">Logs</option>
          <option value="har">HAR Traces</option>
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold cursor-pointer">
          <option value="all">All Status</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
          <option value="flaky">Flaky</option>
        </select>

        <select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value)} className="h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold cursor-pointer">
          <option value="all">Any Time</option>
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 Days</option>
        </select>

        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold cursor-pointer max-w-[130px]">
          <option value="">All Tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="flex items-center bg-muted border rounded-xl p-0.5 ml-auto">
          {[
            { id: "grid", label: "Vault Grid", icon: LayoutGrid },
            { id: "timeline", label: "Timeline", icon: Film },
            { id: "logs", label: "Execution Logs", icon: ScrollText }
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as "grid" | "timeline" | "logs")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9.5px] font-semibold transition-all ${
                mode === m.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <m.icon size={11} /> {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* GRID MODE */}
      {mode === "grid" && (
        <>
          {loading ? (
            <div className="py-24 flex justify-center bg-card border rounded-xl">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center bg-card border rounded-xl space-y-2">
              <FolderOpen size={26} className="text-slate-300 mx-auto" />
              <p className="text-xs font-medium text-muted-foreground">No evidence matches these filters</p>
              <p className="text-xs text-muted-foreground font-medium">Run tests in the Tests tab — screenshots, videos, logs and HAR traces land here automatically.</p>
            </div>
          ) : (
            <>
              <div className="columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4">
                {items.map((item) => {
                  const TypeIcon = (TYPE_META[item.fileType] || TYPE_META.log).icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => openDetail(item.id)}
                      className="w-full mb-4 break-inside-avoid bg-card border rounded-xl shadow-sm overflow-hidden text-left hover:ring-2 hover:ring-primary/30 transition-all group"
                    >
                      {/* media area */}
                      {item.fileType === "screenshot" && item.fileExists ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/hub/evidence/${item.id}/file`}
                          alt={item.testName || "screenshot"}
                          loading="lazy"
                          className="w-full object-cover max-h-56 bg-muted"
                        />
                      ) : item.fileType === "gif" && item.fileExists ? (
                        <div className="relative bg-slate-950">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/hub/evidence/${item.id}/file`}
                            alt={item.testName || "animated gif"}
                            loading="lazy"
                            className="w-full object-cover max-h-56"
                          />
                          <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-black/60 text-white text-xs font-medium rounded-full px-2 py-0.5">
                            <ImageIcon size={9} /> GIF
                          </span>
                        </div>
                      ) : item.fileType === "video" && item.fileExists ? (
                        <div className="relative bg-slate-950">
                          <video src={`/api/hub/evidence/${item.id}/file`} preload="metadata" muted className="w-full max-h-56" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow group-hover:scale-110 transition-transform">
                              <ListVideo size={16} className="text-primary" />
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="h-20 flex items-center justify-center bg-muted/50 border-b gap-2 text-muted-foreground">
                          <TypeIcon size={18} />
                          {item.lineCount !== null && item.lineCount !== undefined && (
                            <span className="text-xs font-semibold bg-muted border rounded-full px-2 py-0.5">{item.lineCount} lines</span>
                          )}
                        </div>
                      )}

                      {/* meta area */}
                      <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <TypeIcon size={11} className="text-primary shrink-0" />
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{(TYPE_META[item.fileType] || TYPE_META.log).label}</span>
                          <span className="ml-auto text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <Clock size={9} /> {relativeTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="font-semibold text-xs text-foreground truncate">
                          {item.testName} <span className="text-muted-foreground font-semibold">#{item.stepNumber}</span>
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={item.status} small />
                          {item.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-xs uppercase font-semibold bg-muted text-muted-foreground border rounded-full px-2 py-px">{t}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{items.length} of {total} evidence files</span>
                {hasMore && (
                  <Button
                    onClick={() => loadEvidence(page + 1, true)}
                    disabled={loadingMore}
                    variant="outline"
                    className="rounded-xl h-8 px-4 text-xs font-semibold border-border text-muted-foreground bg-card"
                  >
                    {loadingMore ? <Loader2 size={11} className="animate-spin" /> : "Load More"}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* TIMELINE MODE */}
      {mode === "timeline" && (
        <div className="bg-card border rounded-xl shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap border-b pb-3">
            <Film size={14} className="text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Timeline Walkthrough</span>
            <select
              value={selectedExecId}
              onChange={(e) => setSelectedExecId(e.target.value)}
              className="h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold cursor-pointer min-w-[280px]"
            >
              {executions.length === 0 && <option value="">No executions with evidence yet</option>}
              {executions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.testName} — {e.status} — {new Date(e.createdAt).toLocaleString()} ({e.evidenceCount} files)
                </option>
              ))}
            </select>
            {timelineExec && (
              <div className="flex items-center gap-2 ml-auto">
                <StatusBadge status={timelineExec.status === "Passed" ? "pass" : timelineExec.status === "Failed" ? "fail" : "info"} />
                <span className="text-xs font-mono font-semibold text-muted-foreground">{timelineExec.browser || "—"} · {formatDuration(timelineExec.duration)}</span>
              </div>
            )}
          </div>

          {timelineLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 size={22} className="animate-spin text-primary" />
            </div>
          ) : timelineSteps.length === 0 ? (
            <p className="text-muted-foreground text-xs text-center py-16">No evidence recorded for this execution.</p>
          ) : (
            <>
              {/* Large step view */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  {activeStep && <EvidenceMedia item={activeStep} large />}
                </div>
                <div className="space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Step {stepIdx + 1} of {timelineSteps.length}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                        disabled={stepIdx === 0}
                        className="p-2 rounded-lg border text-muted-foreground hover:bg-muted/50 disabled:opacity-30"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        onClick={() => setStepIdx((i) => Math.min(timelineSteps.length - 1, i + 1))}
                        disabled={stepIdx >= timelineSteps.length - 1}
                        className="p-2 rounded-lg border text-muted-foreground hover:bg-muted/50 disabled:opacity-30"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                  {activeStep && (
                    <div className="space-y-2 text-xs font-semibold text-muted-foreground bg-muted/50 border rounded-xl p-3">
                      <div><span className="text-muted-foreground text-xs block">Type</span>{(TYPE_META[activeStep.fileType] || TYPE_META.log).label}</div>
                      <div><span className="text-muted-foreground text-xs block">Status</span><StatusBadge status={activeStep.status} small /></div>
                      {activeStep.pageUrl && <div><span className="text-muted-foreground text-xs block">Page URL</span><span className="font-mono break-all">{activeStep.pageUrl}</span></div>}
                      {activeStep.elementLocator && <div><span className="text-muted-foreground text-xs block">Locator / Command</span><span className="font-mono break-all text-primary">{activeStep.elementLocator}</span></div>}
                      <div><span className="text-muted-foreground text-xs block">Captured</span>{new Date(activeStep.createdAt).toLocaleString()}</div>
                      <a
                        href={`/api/hub/evidence/${activeStep.id}/download`}
                        className="inline-flex items-center gap-2 text-primary hover:text-primary font-medium text-xs pt-1"
                      >
                        <Download size={10} /> Download file
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Filmstrip */}
              <div className="flex gap-2 overflow-x-auto pt-2 border-t">
                {timelineSteps.map((s, i) => {
                  const TypeIcon = (TYPE_META[s.fileType] || TYPE_META.log).icon
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStepIdx(i)}
                      className={`shrink-0 w-28 border rounded-xl overflow-hidden text-left transition-all ${
                        i === stepIdx ? "ring-2 ring-primary border-primary/25" : "hover:border-border"
                      }`}
                    >
                      {s.fileType === "screenshot" && s.fileExists ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/hub/evidence/${s.id}/file`} alt={`step ${i + 1}`} className="h-16 w-full object-cover bg-muted" />
                      ) : (
                        <div className="h-16 flex items-center justify-center bg-muted/50 text-muted-foreground">
                          <TypeIcon size={15} />
                        </div>
                      )}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground truncate bg-card">
                        #{i + 1} {(TYPE_META[s.fileType] || TYPE_META.log).label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* EXECUTION LOGS MODE */}
      {mode === "logs" && <ExecutionLogViewer />}

      {/* DETAIL MODAL */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div
            className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && !detail ? (
              <div className="py-20 flex justify-center">
                <Loader2 size={22} className="animate-spin text-primary" />
              </div>
            ) : detail ? (
              <>
                <div className="flex items-center justify-between border-b pb-3 gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {detail.evidence.testName} — Step #{detail.evidence.stepNumber}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => detail.prevId && openDetail(detail.prevId)}
                      disabled={!detail.prevId}
                      title="Previous step"
                      className="p-2 rounded-lg border text-muted-foreground hover:bg-muted/50 disabled:opacity-30"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-xs font-semibold text-muted-foreground">{detail.stepIndex}/{detail.stepTotal}</span>
                    <button
                      onClick={() => detail.nextId && openDetail(detail.nextId)}
                      disabled={!detail.nextId}
                      title="Next step"
                      className="p-2 rounded-lg border text-muted-foreground hover:bg-muted/50 disabled:opacity-30"
                    >
                      <ChevronRight size={13} />
                    </button>
                    <button onClick={() => setDetail(null)} className="p-2 text-muted-foreground hover:text-muted-foreground">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <EvidenceMedia item={detail.evidence} />
                  </div>

                  {/* metadata panel */}
                  <div className="space-y-3">
                    <div className="space-y-2 text-xs font-semibold text-muted-foreground bg-muted/50 border rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={detail.evidence.status} />
                        <span className="text-xs text-muted-foreground">{relativeTime(detail.evidence.createdAt)}</span>
                      </div>
                      <div><span className="text-muted-foreground text-xs block">Test</span>{detail.evidence.testName} ({detail.evidence.scriptType || "—"})</div>
                      <div><span className="text-muted-foreground text-xs block">Browser / Duration</span>{detail.evidence.browser || "—"} · {formatDuration(detail.evidence.executionDuration)}</div>
                      {detail.evidence.pageUrl && (
                        <div><span className="text-muted-foreground text-xs block">Page URL</span><span className="font-mono break-all">{detail.evidence.pageUrl}</span></div>
                      )}
                      {detail.evidence.elementLocator && (
                        <div><span className="text-muted-foreground text-xs block">Locator / Command</span><span className="font-mono break-all text-primary">{detail.evidence.elementLocator}</span></div>
                      )}
                    </div>

                    {/* tags */}
                    <div className="bg-muted/50 border rounded-xl p-3 space-y-2">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Tag size={9} /> Tags</span>
                      <div className="flex gap-2 flex-wrap">
                        {detail.evidence.tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 text-xs uppercase font-semibold bg-card text-muted-foreground border rounded-full pl-2 pr-1 py-0.5">
                            {t}
                            <button onClick={() => updateTags(detail.evidence.tags.filter((x) => x !== t))} className="text-slate-300 hover:text-rose-500">
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addTag()}
                          placeholder="Add tag..."
                          className="flex-1 h-8 rounded-lg border px-2 text-xs bg-card font-semibold"
                        />
                        <button onClick={addTag} className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 text-white flex items-center justify-center">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                    {detail.evidence.fileType === "video" && onOpenVideoLab && (
                      <button
                        onClick={() => onOpenVideoLab(detail.evidence.id)}
                        className="flex items-center justify-center gap-2 h-9 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold w-full"
                      >
                        <Film size={12} /> Open in Video Lab
                      </button>
                    )}

                    <a
                      href={`/api/hub/evidence/${detail.evidence.id}/download`}
                      className="flex items-center justify-center gap-2 h-9 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 text-xs font-semibold"
                    >
                      <Download size={12} /> Download File
                    </a>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
