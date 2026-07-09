"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AnnotationEditor } from "@/components/live-qa/annotation-editor"
import { CreateBugModal } from "@/components/bug-reports/create-bug-modal"
import {
  Maximize,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Minimize2,
  Monitor,
  Pencil,
  ChevronLeft,
  ChevronUp,
  Square,
  AlertTriangle,
  Play,
  Pause,
  Video,
  Camera,
  Bug,
  Plus,
  Search,
  Trash2,
  Loader2,
  Activity,
  Sparkles,
  Layers,
  Globe,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  X,
  ChevronRight,
  Info,
  Terminal,
  Settings,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Zap,
  MousePointerClick
} from "lucide-react"

interface RecordedStep {
  id: string
  stepNumber: number
  pageUrl: string
  actionType: string
  actionDescription: string
  targetType: string
  targetValue: string | null
  inputValue: string | null
  expectedResult: string | null
  recommendedSelector: string | null
  screenshotAfter: string | null
}

interface SessionShot {
  id: string
  filePath: string
  fullPage?: boolean
  annotatedFromId?: string | null
}

type AnnotatingTarget =
  | { kind: "draft"; imageData: string; pageUrl: string | null; fullPage: boolean }
  | { kind: "saved"; shot: SessionShot }

interface SessionClip {
  id: string
  filePath: string | null
  durationMs?: number | null
  createdAt?: string
}

interface Project {
  id: string
  name: string
  webAppUrl: string
  credentials: Array<{ id: string; roleName: string; username: string }>
}

export default function LiveQASessionPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // Project & Session core states
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>("Inactive")
  const [connectionStatus, setConnectionStatus] = useState<string>("Unknown")
  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>([])

  // Setup Form Configuration States
  const [title, setTitle] = useState("")
  const [startUrl, setStartUrl] = useState("")
  const [priority, setPriority] = useState("Medium")
  const [preconditions, setPreconditions] = useState("")
  const [browserType, setBrowserType] = useState<"Chromium" | "Firefox" | "WebKit">("Chromium")
  const [viewport, setViewport] = useState<"Desktop" | "Tablet" | "Mobile">("Desktop")
  const [credentialId, setCredentialId] = useState("")
  const [startingSession, setStartingSession] = useState(false)
  const [startError, setStartError] = useState("")

  // Diagnostics & Event Logs captured
  const [consoleErrors, setConsoleErrors] = useState<string[]>([])
  const [networkErrors, setNetworkErrors] = useState<string[]>([])

  // Interactive capture overlay drawers
  const [showBugDrawer, setShowBugDrawer] = useState(false)
  const [showManualStepDrawer, setShowManualStepDrawer] = useState(false)
  const [showElementDrawer, setShowElementDrawer] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [endingSession, setEndingSession] = useState(false)


  // Manual step form state
  const [manualDescription, setManualDescription] = useState("")
  const [manualActionType, setManualActionType] = useState("click")
  const [manualTargetType, setManualTargetType] = useState("button")
  const [manualTargetValue, setManualTargetValue] = useState("")
  const [manualInputValue, setManualInputValue] = useState("")
  const [manualExpected, setManualExpected] = useState("")

  // Smart Element capture analyzer state
  const [capSelector, setCapSelector] = useState("")
  const [capType, setCapType] = useState("CSS")
  const [capTagName, setCapTagName] = useState("button")
  const [capText, setCapText] = useState("")
  const [capAttributes, setCapAttributes] = useState("")
  const [capturedElements, setCapturedElements] = useState<any[]>([])

  // Screenshot gallery (persisted SessionScreenshot rows — survives reloads).
  // Fresh captures are DRAFTS held in memory only; nothing is persisted until
  // the tester explicitly saves in the annotation editor. Cancel = discarded.
  const [screenshots, setScreenshots] = useState<SessionShot[]>([])
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [annotatingShot, setAnnotatingShot] = useState<AnnotatingTarget | null>(null)
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  // On-demand video recording: MediaRecorder captures the live-view canvas
  // stream and uploads a playable WebM on stop (real start/stop, available
  // before the session ends).
  const [recording, setRecording] = useState(false)
  const [uploadingRecording, setUploadingRecording] = useState(false)

  // Scenario step recording: OFF at session start so the tester can explore
  // freely; toggling on records browser interactions as replay steps until stopped.
  const [stepRecording, setStepRecording] = useState(false)
  const [togglingSteps, setTogglingSteps] = useState(false)
  const [recStartedAt, setRecStartedAt] = useState<number | null>(null)
  const [recordings, setRecordings] = useState<SessionClip[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  // Synchronous mirror of `recording` so the frame handler can skip the extra
  // per-frame canvas decode whenever we're NOT recording video.
  const recordingRef = useRef(false)

  // Session timers + redesigned layout state
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const [eventDrawerOpen, setEventDrawerOpen] = useState(false)
  const [fullView, setFullView] = useState(false)
  const [rightTab, setRightTab] = useState<"screenshots" | "selectors" | "steps">("screenshots")
  const [showFileChooserModal, setShowFileChooserModal] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  // Embedded live browser view (headless Playwright streamed into the app).
  // Chromium sessions stream via CDP screencast over WebSocket; Firefox/WebKit
  // (or a dropped socket) fall back to REST frame polling.
  const [showLivePreview, setShowLivePreview] = useState(true)
  const [hasFrame, setHasFrame] = useState(false)
  // Browser-style zoom: drives the remote viewport size (page reflows), not a
  // client image scale. zoomText backs the editable percentage field.
  const [zoom, setZoom] = useState(1)
  const [zoomText, setZoomText] = useState("100")
  const [streamMode, setStreamMode] = useState<"connecting" | "streaming" | "polling">("connecting")
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState("")
  const urlEditingRef = useRef(false)
  const framePollerRef = useRef<any>(null)
  const frameBusyRef = useRef(false)
  const liveViewRef = useRef<HTMLDivElement | null>(null)
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // Frames are painted imperatively onto imgRef (no per-frame React state).
  // hasFrameRef mirrors hasFrame so the hot path can flip it exactly once.
  const hasFrameRef = useRef(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const inputQueueRef = useRef<Promise<any>>(Promise.resolve())
  const lastMoveSentRef = useRef(0)
  const lastPasteSentRef = useRef(0)

  // Timers & Pollers
  const pollerRef = useRef<any>(null)
  const statsPollerRef = useRef<any>(null)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Recovery & Initial loads
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        // 1. Fetch project meta
        const projRes = await fetch(`/api/projects/${projectId}`)
        if (projRes.ok) {
          const projData = await projRes.json()
          setProject(projData.project)
          setStartUrl(projData.project.webAppUrl || "")
          setTitle(`Exploratory testing session at ${new Date().toLocaleDateString()}`)
        }

        // 2. Check for active recovery session
        const recoverRes = await fetch(`/api/projects/${projectId}/recording/active`)
        if (recoverRes.ok) {
          const data = await recoverRes.json()
          if (data.session) {
            setSessionId(data.session.id)
            setSessionStatus(data.session.status)
            setSessionStartedAt(data.session.startedAt ? new Date(data.session.startedAt).getTime() : Date.now())
            if (data.session.browserType) setBrowserType(data.session.browserType)
            if (data.connection) {
              setConnectionStatus(data.connection.connectionStatus || "Unknown")
            }
          }
        }
      } catch {} finally {
        setLoading(false)
      }
    }
    loadData()
  }, [projectId])

  // Polling management when session changes status
  useEffect(() => {
    if (sessionId && (sessionStatus === "Active" || sessionStatus === "Paused")) {
      startWorkersPolling()
      return () => stopWorkersPolling()
    } else {
      stopWorkersPolling()
    }
  }, [sessionId, sessionStatus])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  function startWorkersPolling() {
    stopWorkersPolling()
    // Poll steps list
    pollerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/recording/${sessionId}/steps`)
        if (res.ok) {
          const data = await res.json()
          setRecordedSteps(data.steps || [])
        }
      } catch {}
    }, 1500)

    // Poll stats (console errors, connection health)
    statsPollerRef.current = setInterval(async () => {
      try {
        const [connRes, statsRes] = await Promise.all([
          fetch(`/api/recording/${sessionId}/connection`),
          fetch(`/api/recording/${sessionId}/stats`)
        ])
        if (connRes.ok) {
          const data = await connRes.json()
          setConnectionStatus(data.connectionStatus || "Unknown")
        }
        if (statsRes.ok) {
          const data = await statsRes.json()
          setConsoleErrors(data.consoleErrors || [])
          setNetworkErrors(data.networkErrors || [])
        }
      } catch {}
    }, 3000)
  }

  function stopWorkersPolling() {
    if (pollerRef.current) clearInterval(pollerRef.current)
    if (statsPollerRef.current) clearInterval(statsPollerRef.current)
  }

  // ── Embedded live browser: frame streaming + input forwarding ─────────────

  function drawToCanvas(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = liveCanvasRef.current
    if (!canvas) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    paint(ctx)
    setHasFrame(true)
  }

  // Latest-frame-wins decoding: JPEG decode is async, so under load frames can
  // arrive faster than they decode. Instead of queueing every frame (stale,
  // laggy playback), keep only the newest blob and decode frames one at a time.
  const pendingFrameRef = useRef<Blob | null>(null)
  const decodingFrameRef = useRef(false)
  // Remote devicePixelRatio: WS frames arrive at CSS px × dsf (retina crisp);
  // REST polling frames are captured at plain CSS px. frameDsfRef tracks the
  // scale of whatever frame is currently on the canvas so mouse coordinates
  // always map back to remote CSS pixels.
  const streamDsfRef = useRef(1)
  const frameDsfRef = useRef(1)
  const lastObjectUrlRef = useRef<string | null>(null)

  function drawFrameBlob(blob: Blob) {
    const url = URL.createObjectURL(blob)
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current)
    }
    lastObjectUrlRef.current = url
    // The <img> is the visible path; keep the input-mapping scale in sync here
    // so it's correct even when the canvas decode below is skipped.
    frameDsfRef.current = streamDsfRef.current
    // Paint imperatively: set the <img> src directly instead of via React state.
    // At 30–60fps a setState per frame would re-render this whole (large)
    // component every frame and saturate the main thread — the real cause of the
    // scroll/interaction lag. The browser decodes the JPEG off the main thread.
    if (imgRef.current) imgRef.current.src = url
    if (!hasFrameRef.current) {
      hasFrameRef.current = true
      setHasFrame(true)
    }

    // Decoding each frame into the hidden canvas is only needed while recording
    // video (MediaRecorder captures that canvas). Skip it otherwise — it halves
    // the client's per-frame work and keeps the live view fluid.
    if (!recordingRef.current) return

    pendingFrameRef.current = blob
    if (decodingFrameRef.current) return
    decodingFrameRef.current = true
    ;(async () => {
      while (pendingFrameRef.current) {
        const next = pendingFrameRef.current
        pendingFrameRef.current = null
        try {
          const bitmap = await createImageBitmap(next)
          drawToCanvas(bitmap.width, bitmap.height, (ctx) => ctx.drawImage(bitmap, 0, 0))
          bitmap.close()
        } catch {}
      }
      decodingFrameRef.current = false
    })()
  }

  function drawFrameDataUrl(dataUrl: string) {
    // REST-polling path (Firefox/WebKit/reconnect): also paint imperatively.
    frameDsfRef.current = 1 // polling frames are plain CSS pixels
    if (imgRef.current) imgRef.current.src = dataUrl
    if (!hasFrameRef.current) {
      hasFrameRef.current = true
      setHasFrame(true)
    }
  }

  async function fetchLiveFrame() {
    if (!sessionId || frameBusyRef.current) return
    frameBusyRef.current = true
    try {
      const res = await fetch(`/api/recording/${sessionId}/frame`)
      if (res.ok) {
        const data = await res.json()
        if (data.frame) {
          drawFrameDataUrl(data.frame)
          setLiveUrl(data.url)
          if (data.fileChooserOpen) {
            setShowFileChooserModal(true)
          }
        }
      }
    } catch {} finally {
      frameBusyRef.current = false
    }
  }

  // REST polling — the fallback path. Active whenever the WebSocket stream
  // isn't delivering frames (non-Chromium sessions, reconnect windows).
  useEffect(() => {
    if (!sessionId || sessionStatus !== "Active" || !showLivePreview || streamMode === "streaming") {
      if (framePollerRef.current) clearInterval(framePollerRef.current)
      return
    }
    fetchLiveFrame()
    framePollerRef.current = setInterval(fetchLiveFrame, 350)
    return () => {
      if (framePollerRef.current) clearInterval(framePollerRef.current)
    }
  }, [sessionId, sessionStatus, showLivePreview, streamMode])

  // CDP screencast stream over WebSocket (Chromium only). On any failure the
  // client drops to polling and keeps retrying the socket with backoff —
  // inputs are never queued for replay; they route through REST meanwhile.
  useEffect(() => {
    if (!sessionId || sessionStatus !== "Active" || !showLivePreview) return
    if (browserType !== "Chromium") {
      setStreamMode("polling")
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
                if (msg.mode === "streaming") setStreamMode("streaming")
                if (msg.mode === "polling") {
                  // Worker says screencast is unavailable — stop retrying.
                  cancelled = true
                  setStreamMode("polling")
                }
              } else if (msg.type === "dsf" && msg.dsf) {
                streamDsfRef.current = Number(msg.dsf) || 1
              } else if (msg.type === "url" && msg.url) {
                setLiveUrl(msg.url)
              } else if (msg.type === "filechooser" && msg.open) {
                setShowFileChooserModal(true)
              }
            } catch {}
          } else {
            drawFrameBlob(ev.data as Blob)
          }
        }
        ws.onclose = () => {
          wsRef.current = null
          if (cancelled) return
          setStreamMode("polling")
          attempt++
          retryTimer = setTimeout(connect, Math.min(8000, 1000 * 2 ** Math.min(attempt, 3)))
        }
        ws.onerror = () => { try { ws?.close() } catch {} }
      } catch {
        if (cancelled) return
        setStreamMode("polling")
        attempt++
        retryTimer = setTimeout(connect, Math.min(8000, 1000 * 2 ** Math.min(attempt, 3)))
      }
    }

    setStreamMode("connecting")
    connect()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      wsRef.current = null
      try { ws?.close() } catch {}
    }
  }, [sessionId, sessionStatus, showLivePreview, browserType])

  // Elapsed-time ticker for the header + recording indicator
  useEffect(() => {
    if (!sessionId) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sessionId])

  function fmtElapsed(fromMs: number | null): string {
    if (!fromMs) return "00:00"
    const secs = Math.max(0, Math.floor((nowTick - fromMs) / 1000))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const sec = secs % 60
    const mm = String(m).padStart(2, "0")
    const ss = String(sec).padStart(2, "0")
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  // Load persisted session screenshots (gallery survives page reloads)
  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/recording/${sessionId}/screenshots`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.screenshots) setScreenshots(data.screenshots) })
      .catch(() => {})
    fetch(`/api/recording/${sessionId}/recordings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.recordings) setRecordings(data.recordings) })
      .catch(() => {})
  }, [sessionId])

  // Keep the URL bar in sync with the page unless the tester is editing it
  useEffect(() => {
    if (!urlEditingRef.current && liveUrl) setUrlInput(liveUrl)
  }, [liveUrl])

  // Input goes over the WebSocket when it's open (lowest latency). Otherwise
  // it falls back to the serialized REST queue — never queued for later
  // replay, so a reconnect can't fire stale clicks against a changed page.
  function sendBrowserInput(payload: Record<string, unknown>) {
    if (!sessionId || sessionStatus !== "Active") return
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload))
        return
      } catch {}
    }
    const sid = sessionId
    inputQueueRef.current = inputQueueRef.current
      .then(() =>
        fetch(`/api/recording/${sid}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      )
      .then(() => { if (streamMode !== "streaming") fetchLiveFrame() })
      .catch(() => {})
  }

  // Map a mouse event on the scaled frame view (image or fallback canvas) to remote CSS-px coordinates
  function liveViewCoords(e: { clientX: number; clientY: number }) {
    const img = imgRef.current
    if (img && img.naturalWidth) {
      const rect = img.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const dsf = frameDsfRef.current || 1
      return {
        x: Math.round(((e.clientX - rect.left) / rect.width) * (img.naturalWidth / dsf)),
        y: Math.round(((e.clientY - rect.top) / rect.height) * (img.naturalHeight / dsf))
      }
    }
    const canvas = liveCanvasRef.current
    if (!canvas || !canvas.width) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const dsf = frameDsfRef.current || 1
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * (canvas.width / dsf)),
      y: Math.round(((e.clientY - rect.top) / rect.height) * (canvas.height / dsf))
    }
  }

  const MOUSE_BUTTONS: Record<number, string> = { 0: "left", 1: "middle", 2: "right" }

  // Translate a React keyboard event into a Playwright key/combo string
  function mapKeyboardEvent(e: React.KeyboardEvent): string | null {
    if (e.key === "Control" || e.key === "Meta" || e.key === "Alt" || e.key === "Shift") return null
    const key = e.key === " " ? "Space" : e.key
    const mods: string[] = []
    if (e.ctrlKey) mods.push("Control")
    if (e.metaKey) mods.push("Meta")
    if (e.altKey) mods.push("Alt")
    // e.key already reflects Shift for printable chars; only add it for named keys
    if (e.shiftKey && key.length > 1) mods.push("Shift")
    return [...mods, key].join("+")
  }

  // Wheel needs a non-passive native listener so we can preventDefault and
  // scroll the remote page instead of this one. Deltas are ACCUMULATED and
  // flushed once per animation frame: the old fixed 80ms throttle simply
  // dropped the skipped events, so fast scrolls lost distance and felt sluggish.
  // Coalescing sends the summed delta (~60/s max) — smooth, nothing lost.
  useEffect(() => {
    const el = liveViewRef.current
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
      if (lastCoords) {
        sendBrowserInput({ type: "wheel", ...lastCoords, deltaX: Math.round(dx), deltaY: Math.round(dy) })
      }
    }

    function onWheel(ev: WheelEvent) {
      ev.preventDefault()
      const coords = liveViewCoords(ev)
      if (coords) lastCoords = coords
      accX += ev.deltaX
      accY += ev.deltaY
      if (!raf) raf = requestAnimationFrame(flush)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [sessionId, sessionStatus, showLivePreview])

  // Browser-style zoom, 25%–300%. Changing zoom re-sends the remote viewport
  // (see the fit-to-container effect, which divides by zoom).
  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3
  const ZOOM_STEP = 0.1
  function applyZoom(next: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100))
    setZoom(clamped)
    setZoomText(String(Math.round(clamped * 100)))
  }
  // Commit a typed percentage (Enter / blur). Invalid input reverts to current.
  function commitZoomText() {
    const n = parseInt(zoomText, 10)
    if (Number.isFinite(n) && n > 0) applyZoom(n / 100)
    else setZoomText(String(Math.round(zoom * 100)))
  }

  // Fit-to-container: keep the remote viewport matched to the live view's
  // visible area so the stream fills it edge-to-edge (no letterboxing).
  // Debounced — window drags/panel toggles fire many resize events.
  useEffect(() => {
    const el = liveViewRef.current
    if (!el || !sessionId || sessionStatus !== "Active" || !showLivePreview) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const sendResize = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 320 || rect.height < 320) return
      // Browser-style zoom: shrink the REMOTE viewport by the zoom factor so the
      // page genuinely reflows and re-renders larger (crisp, like Chrome's
      // Ctrl +/-), instead of magnifying the streamed image. The worker clamps
      // to sane bounds; the CDP screencast follows the new size per frame.
      const width = Math.round(rect.width / zoom)
      const height = Math.round(rect.height / zoom)
      sendBrowserInput({ type: "resize", width, height })
    }

    // Match immediately on session start / view open / zoom change, then follow.
    sendResize()
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(sendResize, 350)
    })
    observer.observe(el)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sessionStatus, showLivePreview, fullView, zoom])

  // ── Session Controls ───────────────────────────────────────────────────────

  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startUrl.trim()) {
      setStartError("Session Name and Target URL are required")
      return
    }

    setStartingSession(true)
    setStartError("")

    try {
      const res = await fetch(`/api/projects/${projectId}/recording/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          priority,
          preconditions: preconditions || undefined,
          requiredCredentialId: credentialId || null,
          startUrl,
          browserType,
          viewport,
          recordingMode: "Detailed",
          mode: "Workstation"
        })
      })

      if (res.ok) {
        const data = await res.json()
        setSessionId(data.session.id)
        setSessionStatus(data.session.status)
        setSessionStartedAt(data.session.startedAt ? new Date(data.session.startedAt).getTime() : Date.now())
        setToast({ message: "Live browser session started — interact in the view below.", type: "success" })
      } else {
        const err = await res.json()
        setStartError(err.error || "Failed to start live QA browser session")
      }
    } catch {
      setStartError("Network error starting browser workstation")
    } finally {
      setStartingSession(false)
    }
  }

  async function handlePauseResume() {
    if (!sessionId) return
    const action = sessionStatus === "Active" ? "pause" : "resume"
    try {
      const res = await fetch(`/api/recording/${sessionId}/${action}`, { method: "POST" })
      if (res.ok) {
        setSessionStatus(action === "pause" ? "Paused" : "Active")
        setToast({ message: `Session ${action === "pause" ? "paused" : "resumed"} successfully`, type: "success" })
      }
    } catch {}
  }

  async function handleEndSession(finish: boolean) {
    if (!sessionId) return
    // Don't lose an in-flight recording — stop and upload it first.
    if (mediaRecorderRef.current) await handleStopRecording()
    const action = finish ? "finish" : "cancel"
    try {
      const res = await fetch(`/api/recording/${sessionId}/${action}`, { method: "POST" })
      if (res.ok) {
        setSessionId(null)
        setSessionStatus("Inactive")
        setRecordedSteps([])
        setScreenshots([])
        setConsoleErrors([])
        setNetworkErrors([])
        setRecording(false)
        setStepRecording(false)
        setRecStartedAt(null)
        setRecordings([])
        setFullView(false)
        setSessionStartedAt(null)
        setHasFrame(false)
        setStreamMode("connecting")
        setLiveUrl(null)
        setAnnotatingShot(null)
        setToast({ message: finish ? "Live QA Session successfully completed and converted to test case!" : "Session cancelled.", type: "success" })
      }
    } catch {}
  }

  // ── Evidentiary Capture Actions ──────────────────────────────────────────

  async function handleTakeScreenshot(fullPage: boolean) {
    if (!sessionId) return
    setCapturingScreenshot(true)
    try {
      const res = await fetch(`/api/recording/${sessionId}/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullPage })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.imageData) {
          // Draft only — persisted when the tester saves in the editor;
          // cancelling discards it completely.
          setAnnotatingShot({
            kind: "draft",
            imageData: data.imageData,
            pageUrl: data.pageUrl || null,
            fullPage: !!data.fullPage,
          })
        }
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.error || "Screenshot capture failed", type: "error" })
      }
    } catch {
      setToast({ message: "Network error capturing screenshot", type: "error" })
    } finally {
      setCapturingScreenshot(false)
    }
  }

  async function handleSaveAnnotatedShot(dataUrl: string) {
    if (!sessionId || !annotatingShot) return
    setSavingAnnotation(true)
    try {
      const body =
        annotatingShot.kind === "saved"
          ? { imageData: dataUrl, annotatedFromId: annotatingShot.shot.id }
          : { imageData: dataUrl, pageUrl: annotatingShot.pageUrl, fullPage: annotatingShot.fullPage }
      const res = await fetch(`/api/recording/${sessionId}/screenshot/annotated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        const data = await res.json()
        if (annotatingShot.kind === "saved") {
          // Replace the raw capture with the annotated version in the gallery
          setScreenshots(prev => prev.map(p => (p.id === annotatingShot.shot.id ? data.screenshot : p)))
        } else {
          setScreenshots(prev => [...prev, data.screenshot])
        }
        setToast({ message: "Screenshot saved!", type: "success" })
        setAnnotatingShot(null)
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.error || "Failed to save annotated screenshot", type: "error" })
      }
    } catch {
      setToast({ message: "Network error saving annotated screenshot", type: "error" })
    } finally {
      setSavingAnnotation(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/recording/${sessionId}/upload-file`, {
        method: "POST",
        body: formData
      })
      if (!res.ok) {
        const d = await res.json()
        setToast({ message: d.error || "Failed to upload file to browser", type: "error" })
      } else {
        setToast({ message: `File "${file.name}" uploaded successfully!`, type: "success" })
        setShowFileChooserModal(false)
      }
    } catch (err: any) {
      setToast({ message: err.message || "Failed to upload file to browser", type: "error" })
    } finally {
      setUploadingFile(false)
    }
  }

  const handleCancelFileChooser = async () => {
    if (!sessionId) return
    try {
      await fetch(`/api/recording/${sessionId}/cancel-file`, { method: "POST" })
    } catch {}
    setShowFileChooserModal(false)
  }

  function handleStartRecording() {
    const canvas = liveCanvasRef.current
    if (!canvas || !hasFrame) {
      setToast({ message: "Wait for the live view to connect before recording.", type: "error" })
      return
    }
    try {
      // Seed the canvas with the frame that's on screen right now, and enable
      // per-frame canvas decoding, so the recording captures content even if
      // the page stays static after we start.
      const img = imgRef.current
      if (img && img.naturalWidth) {
        drawToCanvas(img.naturalWidth, img.naturalHeight, (ctx) => ctx.drawImage(img, 0, 0))
      }
      recordingRef.current = true

      const stream = canvas.captureStream(30)
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m))
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recChunksRef.current.push(e.data)
      }
      recorder.start(1000)
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecStartedAt(Date.now())
    } catch {
      recordingRef.current = false
      setToast({ message: "Could not start recording in this browser.", type: "error" })
    }
  }

  async function handleStopRecording(): Promise<void> {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    mediaRecorderRef.current = null
    recordingRef.current = false
    const startedAt = recStartedAt

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    try { recorder.stop() } catch {}
    recorder.stream.getTracks().forEach((t) => t.stop())
    await stopped

    setRecording(false)
    const durationMs = startedAt ? Date.now() - startedAt : 0
    setRecStartedAt(null)

    const blob = new Blob(recChunksRef.current, { type: "video/webm" })
    recChunksRef.current = []
    if (blob.size === 0 || !sessionId) return

    setUploadingRecording(true)
    try {
      const fd = new FormData()
      fd.append("file", blob, "recording.webm")
      fd.append("durationMs", String(durationMs))
      const res = await fetch(`/api/recording/${sessionId}/recordings`, { method: "POST", body: fd })
      if (res.ok) {
        const data = await res.json()
        setRecordings((prev) => [...prev, data.recording])
        setToast({ message: "Recording saved — playable in the Screenshots panel.", type: "success" })
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.error || "Failed to save recording", type: "error" })
      }
    } catch {
      setToast({ message: "Network error saving recording", type: "error" })
    } finally {
      setUploadingRecording(false)
    }
  }

  // Start/stop capturing browser interactions as replay steps (Live QA scenario
  // recording). Independent of video recording.
  async function handleToggleStepRecording() {
    if (!sessionId) return
    const next = !stepRecording
    setTogglingSteps(true)
    try {
      const res = await fetch(`/api/recording/${sessionId}/step-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) {
        setStepRecording(next)
        setToast({
          message: next
            ? "Recording scenario steps — your interactions are now captured."
            : "Stopped recording steps. Explore freely; start again for the next scenario.",
          type: "success",
        })
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.error || "Failed to toggle step recording", type: "error" })
      }
    } catch {
      setToast({ message: "Network error toggling step recording", type: "error" })
    } finally {
      setTogglingSteps(false)
    }
  }

  async function handleAddManualStep(e: React.FormEvent) {
    e.preventDefault()
    if (!manualDescription.trim()) return

    try {
      const res = await fetch(`/api/recording/${sessionId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionDescription: manualDescription,
          actionType: manualActionType,
          targetType: manualTargetType,
          targetValue: manualTargetValue || null,
          inputValue: manualInputValue || null,
          pageUrl: startUrl
        })
      })

      if (res.ok) {
        setShowManualStepDrawer(false)
        setManualDescription("")
        setManualTargetValue("")
        setManualInputValue("")
        setToast({ message: "Manual step appended successfully!", type: "success" })
      }
    } catch {}
  }

  function handleSaveElement() {
    if (!capSelector.trim()) return
    const score = Math.round(75 + Math.random() * 20) // Stability simulation score
    setCapturedElements(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        selector: capSelector,
        type: capType,
        tagName: capTagName,
        text: capText,
        reliabilityScore: score,
        capturedAt: new Date().toLocaleTimeString()
      }
    ])
    setCapSelector("")
    setCapText("")
    setShowElementDrawer(false)
    setToast({ message: "Element attributes saved to Locator Library context!", type: "success" })
  }

  // AI Rule-Based assertions recommender
  function getSuggestions() {
    const list = []
    const lastStep = recordedSteps[recordedSteps.length - 1]
    if (!lastStep) {
      list.push("Navigate to starting URL to generate assertion suggestions.")
    } else {
      if (lastStep.actionType === "click" || lastStep.actionType === "submit") {
        list.push(`Verify action response successfully loaded at page URL.`)
        list.push(`Verify target element changed state after click.`)
      }
      if (lastStep.actionType === "fill" || lastStep.actionType === "type") {
        list.push(`Assert value '${lastStep.inputValue || ""}' is correct in inputs.`)
      }
      if (lastStep.recommendedSelector) {
        list.push(`Assert visibility state of locator element: ${lastStep.recommendedSelector}`)
      }
    }
    return list
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-background">

      {/* End session confirmation */}
      <ConfirmDialog
        open={showEndConfirm}
        title="End live testing session?"
        description="This closes the controlled browser and ends the session without converting it into a test case. Bugs and screenshots you already captured are kept."
        confirmLabel="End Session"
        cancelLabel="Keep Testing"
        variant="danger"
        isLoading={endingSession}
        onConfirm={async () => {
          setEndingSession(true)
          await handleEndSession(false)
          setEndingSession(false)
          setShowEndConfirm(false)
        }}
        onCancel={() => setShowEndConfirm(false)}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-top duration-300 max-w-md ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-800" 
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-800"
        }`}>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground animate-pulse font-semibold">
          Loading Live QA Session...
        </div>
      ) : !sessionId ? (
        
        // ═════════════════════════════════════════════════════════════════════
        // INITIAL WORKSTATION SETUP FORM
        // ═════════════════════════════════════════════════════════════════════
        <div className="flex-1 overflow-y-auto max-w-2xl mx-auto px-6 py-12 space-y-8 select-none text-xs font-semibold">
          <div className="space-y-1.5 border-b pb-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                <Zap className="h-7 w-7 text-indigo-500 fill-current" /> Live QA Session
              </h1>
              <button
                type="button"
                onClick={() => router.push(`/projects/${projectId}/live-qa-history`)}
                className="shrink-0 mt-1 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Activity className="h-3.5 w-3.5" /> Session history
              </button>
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              Start a live browser session — embedded right in this page — to perform manual validation, record replay steps, capture video, and log defect traces.
            </p>
          </div>

          <form onSubmit={handleStartSession} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="work-title">Session / Test Case Title *</Label>
              <Input id="work-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="work-url">Target Startup URL *</Label>
              <Input id="work-url" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="work-priority">Default Priority</Label>
                <select id="work-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="work-browser">QA Browser Platform</Label>
                <select id="work-browser" value={browserType} onChange={(e) => setBrowserType(e.target.value as any)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                  <option value="Chromium">Chromium (Chrome/Edge)</option>
                  <option value="Firefox">Mozilla Firefox</option>
                  <option value="WebKit">Apple WebKit (Safari)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="work-viewport">Viewport Configuration</Label>
                <select id="work-viewport" value={viewport} onChange={(e) => setViewport(e.target.value as any)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                  <option value="Desktop">Desktop Workspace (1280x800)</option>
                  <option value="Tablet">Tablet Device (768x1024)</option>
                  <option value="Mobile">Mobile Layout (375x667)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="work-cred">Pre-Login Role Context</Label>
                <select id="work-cred" value={credentialId} onChange={(e) => setCredentialId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                  <option value="">-- No Authentication --</option>
                  {project?.credentials.map((c) => <option key={c.id} value={c.id}>{c.roleName}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="work-precond">Preconditions</Label>
              <Input id="work-precond" value={preconditions} onChange={(e) => setPreconditions(e.target.value)} placeholder="User must have active credential balance..." />
            </div>

            <div className="flex items-start gap-2 pt-2 rounded-lg border border-teal-200 bg-teal-50/40 p-3 dark:border-teal-900 dark:bg-teal-950/20">
              <Video className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <Label className="cursor-default font-normal text-[11px] leading-relaxed text-teal-800 dark:text-teal-300">
                The test browser runs fully <b>inside this page</b> — no external window. Nothing is recorded automatically: explore freely, then use <b>Record steps</b> to capture a scenario and <b>Start recording</b> for video — each starts and stops anytime from the toolbar.
              </Label>
            </div>

            {startError && <p className="text-sm text-destructive font-semibold">{startError}</p>}

            <Button type="submit" disabled={startingSession} className="w-full flex items-center justify-center gap-1.5 font-semibold h-10 mt-6 bg-indigo-600 hover:bg-indigo-700 text-white">
              {startingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start Embedded Testing Session
            </Button>
          </form>
        </div>
      ) : (
        
        // Active session — approved Phase 6 layout:
        // header bar (status + timer + Capture/Record/Bug/End clusters),
        // dominant embedded browser, tabbed right panel, collapsible event drawer.
        // fullView maximizes the browser over the whole app while keeping the
        // header controls visible; the canvas never remounts (recording-safe).
        <div className={fullView ? "fixed inset-0 z-40 bg-background flex flex-col min-h-0" : "flex-1 flex flex-col min-h-0"}>

          {/* ── Header bar ── */}
          <header className="px-4 py-2.5 border-b bg-card flex items-center gap-3 shrink-0 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 mr-auto">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {sessionStatus === "Active" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  sessionStatus === "Active" ? "bg-emerald-500" : "bg-amber-500"
                }`} />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-foreground truncate leading-tight" title={title}>
                  {title}
                </h1>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {sessionStatus} &middot; {connectionStatus} &middot; <span className="tabular-nums font-medium">{fmtElapsed(sessionStartedAt)}</span> elapsed
                </p>
              </div>
            </div>

            {/* Cluster: Capture */}
            <div className="flex items-center rounded-lg border bg-background p-0.5 gap-0.5">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">Capture</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTakeScreenshot(false)}
                disabled={capturingScreenshot}
                className="h-8 px-2.5 text-xs gap-1.5 text-foreground"
                title="Capture the visible viewport, then annotate"
              >
                {capturingScreenshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 text-indigo-500" />}
                Screenshot
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTakeScreenshot(true)}
                disabled={capturingScreenshot}
                className="h-8 px-2.5 text-xs gap-1.5 text-foreground"
                title="Capture the entire scrollable page, then annotate"
              >
                <Maximize className="h-3.5 w-3.5 text-indigo-500" /> Full page
              </Button>
            </div>

            {/* Cluster: Record */}
            <div className="flex items-center rounded-lg border bg-background p-0.5 gap-0.5">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">Record</span>
              {recording ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStopRecording}
                  className="h-8 px-2.5 text-xs gap-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  title="Stop recording — the clip is saved and playable immediately"
                >
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="tabular-nums font-medium">{fmtElapsed(recStartedAt)}</span>
                  <Square className="h-3 w-3 fill-current" /> Stop
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartRecording}
                  disabled={uploadingRecording}
                  className="h-8 px-2.5 text-xs gap-1.5 text-foreground"
                  title="Record the live view as WebM (start/stop anytime)"
                >
                  {uploadingRecording
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Video className="h-3.5 w-3.5 text-indigo-500" />}
                  {uploadingRecording ? "Saving…" : "Start recording"}
                </Button>
              )}
            </div>

            {/* Cluster: Steps — scenario step recording (independent of video) */}
            <div className="flex items-center rounded-lg border bg-background p-0.5 gap-0.5">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">Steps</span>
              {stepRecording ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleStepRecording}
                  disabled={togglingSteps}
                  className="h-8 px-2.5 text-xs gap-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  title="Stop recording scenario steps"
                >
                  {togglingSteps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                  <Square className="h-3 w-3 fill-current" /> Stop steps
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleStepRecording}
                  disabled={togglingSteps}
                  className="h-8 px-2.5 text-xs gap-1.5 text-foreground"
                  title="Start recording your interactions as replay steps"
                >
                  {togglingSteps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MousePointerClick className="h-3.5 w-3.5 text-indigo-500" />}
                  Record steps
                </Button>
              )}
            </div>

            {/* Cluster: Bug */}
            <div className="flex items-center rounded-lg border bg-background p-0.5">
              <Button
                size="sm"
                onClick={() => setShowBugDrawer(true)}
                className="h-8 px-3 text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Bug className="h-3.5 w-3.5" /> Create Bug
              </Button>
            </div>

            {/* Cluster: End */}
            <div className="flex items-center rounded-lg border bg-background p-0.5 gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePauseResume}
                className="h-8 px-2.5 text-xs gap-1.5 text-foreground"
                title={sessionStatus === "Active" ? "Pause session" : "Resume session"}
              >
                {sessionStatus === "Active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {sessionStatus === "Active" ? "Pause" : "Resume"}
              </Button>
              <Button
                size="sm"
                onClick={() => handleEndSession(true)}
                className="h-8 px-2.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Save &amp; Complete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEndConfirm(true)}
                className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-red-600"
                title="End without saving a test case"
              >
                <X className="h-3.5 w-3.5" /> End
              </Button>
            </div>
          </header>

          {/* ── Main: browser + right panel ── */}
          <div className="flex-1 flex min-h-0">

            <main className={`flex-1 flex flex-col min-w-0 ${fullView ? "p-2" : "p-4 pr-0"}`}>
              {/* Embedded live browser — interact here directly, no external window */}
              <div className="flex-1 flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm min-h-0">
                <div className="px-2.5 py-1.5 border-b flex items-center gap-1 bg-muted/40 shrink-0">
                  <Monitor className="h-3.5 w-3.5 text-indigo-500 mx-1 shrink-0" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => sendBrowserInput({ type: "back" })}
                    title="Back"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => sendBrowserInput({ type: "forward" })}
                    title="Forward"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => sendBrowserInput({ type: "reload" })}
                    title="Reload"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onFocus={() => { urlEditingRef.current = true }}
                    onBlur={() => { urlEditingRef.current = false }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const target = urlInput.trim()
                        if (target) {
                          sendBrowserInput({
                            type: "goto",
                            url: /^https?:\/\//i.test(target) ? target : `https://${target}`
                          })
                        }
                        ;(e.target as HTMLInputElement).blur()
                      }
                    }}
                    placeholder="Enter URL and press Enter…"
                    spellCheck={false}
                    className="flex-1 h-6 min-w-0 mx-1 rounded-md border bg-background px-2.5 font-mono text-[11px] text-muted-foreground focus:text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <span className={`text-[10px] font-medium flex items-center gap-1 px-1.5 shrink-0 ${
                    connectionStatus === "Connected" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  }`}>
                    <Activity className="h-3 w-3" /> {connectionStatus}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                      streamMode === "streaming"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : streamMode === "connecting"
                        ? "bg-muted text-muted-foreground animate-pulse"
                        : browserType === "Chromium"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                    title={
                      streamMode === "streaming"
                        ? "Live CDP stream (15–30 fps)"
                        : streamMode === "connecting"
                        ? "Connecting to the live stream…"
                        : browserType === "Chromium"
                        ? "Stream dropped — showing polled frames while reconnecting. Input stays active."
                        : "Frame polling (streaming is Chromium-only)"
                    }
                  >
                    {streamMode === "streaming" ? "Streaming" : streamMode === "connecting" ? "Connecting…" : browserType === "Chromium" ? "Reconnecting" : "Polling"}
                  </span>
                  {/* Zoom controls — real browser zoom: steppers + editable %.
                      Changing zoom reflows the remote page (crisp, like Chrome). */}
                  <div className="flex items-center gap-0.5 shrink-0 border-l pl-1 ml-0.5">
                    <button
                      onClick={() => applyZoom(zoom - ZOOM_STEP)}
                      disabled={zoom <= ZOOM_MIN}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                      title="Zoom out (−10%)"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center">
                      <input
                        value={zoomText}
                        onChange={(e) => setZoomText(e.target.value.replace(/[^\d]/g, ""))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { commitZoomText(); (e.target as HTMLInputElement).blur() }
                        }}
                        onBlur={commitZoomText}
                        onFocus={(e) => e.target.select()}
                        inputMode="numeric"
                        aria-label="Zoom percentage"
                        title="Type an exact zoom % and press Enter"
                        className="w-8 text-[10px] font-semibold text-center tabular-nums bg-transparent outline-none focus:bg-muted rounded px-0.5 text-muted-foreground focus:text-foreground"
                      />
                      <span className="text-[10px] font-semibold text-muted-foreground select-none">%</span>
                    </div>
                    <button
                      onClick={() => applyZoom(zoom + ZOOM_STEP)}
                      disabled={zoom >= ZOOM_MAX}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                      title="Zoom in (+10%)"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => applyZoom(1)}
                      disabled={zoom === 1}
                      className="text-[9px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 px-1"
                      title="Reset zoom to 100%"
                    >
                      Reset
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => setFullView(v => !v)}
                    title={fullView ? "Exit maximized view" : "Maximize the browser view (controls stay in the header)"}
                  >
                    {fullView ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </Button>
                  <button
                    onClick={() => setShowLivePreview(v => !v)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 px-1"
                  >
                    {showLivePreview ? "Hide" : "Show"}
                  </button>
                </div>

                {/* Fit-to-screen: the frame always scales to fit the available
                    area on both axes (aspect preserved), so the full page is
                    visible without local scrolling — wheel events scroll the
                    remote page, not this container. */}
                {showLivePreview && (
                  <div className="flex-1 min-h-0 overflow-hidden bg-muted/20 flex">
                    <div
                      ref={liveViewRef}
                      tabIndex={0}
                      className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/60 select-none"
                      onKeyDown={(e) => {
                        // Cmd/Ctrl+V: the remote browser's clipboard is empty —
                        // the text must come from the local clipboard. Don't
                        // preventDefault or forward the combo: letting it
                        // through fires a native paste event (handled below),
                        // which exposes clipboard data in every browser without
                        // permission prompts. If no paste event arrives (focus
                        // edge cases), fall back to the async clipboard API.
                        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v" && !e.altKey && !e.shiftKey) {
                          setTimeout(() => {
                            if (Date.now() - lastPasteSentRef.current < 500) return
                            navigator.clipboard
                              ?.readText()
                              .then((text) => {
                                if (text) {
                                  lastPasteSentRef.current = Date.now()
                                  sendBrowserInput({ type: "type", text })
                                }
                              })
                              .catch(() => {
                                setToast({ message: "Couldn't read the clipboard — allow clipboard permission for this site, or use https/localhost.", type: "error" })
                              })
                          }, 250)
                          return
                        }
                        const combo = mapKeyboardEvent(e)
                        if (combo) {
                          e.preventDefault()
                          sendBrowserInput({ type: "key", key: combo })
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault()
                        const text = e.clipboardData?.getData("text")
                        if (text) {
                          lastPasteSentRef.current = Date.now()
                          sendBrowserInput({ type: "type", text })
                        }
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <canvas
                        ref={liveCanvasRef}
                        className="hidden"
                      />
                      {/* Frames are painted imperatively onto this <img> (src set
                          via imgRef), so it renders unconditionally. */}
                      <img
                        ref={imgRef}
                        alt="Live browser view"
                        className={`max-w-full max-h-full w-auto h-auto block select-none cursor-default ${hasFrame ? "" : "hidden"}`}
                        draggable={false}
                        onMouseDown={(e) => {
                          liveViewRef.current?.focus()
                          const coords = liveViewCoords(e)
                          if (coords) sendBrowserInput({ type: "mousedown", ...coords, button: MOUSE_BUTTONS[e.button] || "left" })
                        }}
                        onMouseMove={(e) => {
                          const now = Date.now()
                          if (now - lastMoveSentRef.current < 40) return
                          lastMoveSentRef.current = now
                          const coords = liveViewCoords(e)
                          if (coords) sendBrowserInput({ type: "mousemove", ...coords })
                        }}
                        onMouseUp={(e) => {
                          const coords = liveViewCoords(e)
                          if (coords) sendBrowserInput({ type: "mouseup", ...coords, button: MOUSE_BUTTONS[e.button] || "left" })
                        }}
                      />
                      {!hasFrame && (
                        <div className="p-16 text-center text-xs text-muted-foreground">
                          {sessionStatus === "Active" ? "Connecting to embedded browser…" : "Session paused."}
                        </div>
                      )}
                      {sessionStatus !== "Active" && hasFrame && (
                        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center">
                          <span className="text-xs font-semibold text-muted-foreground bg-card border rounded-full px-3 py-1.5">
                            Session paused — resume to keep testing
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Browser Event Stream drawer ── */}
              <div className={`mt-3 border rounded-xl bg-card overflow-hidden shrink-0 ${fullView ? "hidden" : ""}`}>
                <button
                  onClick={() => setEventDrawerOpen(v => !v)}
                  className="w-full px-4 py-2 flex items-center gap-2 text-xs font-medium text-foreground hover:bg-accent/40 transition-colors"
                >
                  <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                  Browser Event Stream
                  {(consoleErrors.length + networkErrors.length) > 0 ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 text-[10px] font-bold tabular-nums">
                      <AlertTriangle className="h-2.5 w-2.5" /> {consoleErrors.length + networkErrors.length}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">no errors</span>
                  )}
                  <span className="ml-auto text-muted-foreground">
                    {eventDrawerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </span>
                </button>
                {eventDrawerOpen && (
                  <div className="border-t bg-slate-950 text-slate-100 max-h-40 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px] leading-relaxed">
                    {consoleErrors.length === 0 && networkErrors.length === 0 ? (
                      <p className="text-slate-500 italic">Listening for browser exceptions, console errors, and failed requests…</p>
                    ) : (
                      <>
                        {consoleErrors.map((err, idx) => (
                          <div key={`c-${idx}`} className="text-yellow-400">
                            <span className="text-yellow-500">[Console]</span> {err}
                          </div>
                        ))}
                        {networkErrors.map((err, idx) => (
                          <div key={`n-${idx}`} className="text-red-400">
                            <span className="text-red-500">[Network]</span> {err}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </main>

            {/* ── Right panel: Screenshots / Selectors / Steps ── */}
            <aside className={`w-72 shrink-0 flex-col p-4 ${fullView ? "hidden" : "flex"}`}>
              <div className="flex-1 flex flex-col border rounded-xl bg-card overflow-hidden min-h-0">
                <div className="flex border-b text-xs font-medium text-muted-foreground shrink-0">
                  {([
                    ["screenshots", "Screenshots"],
                    ["selectors", "Selectors"],
                    ["steps", "Steps"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setRightTab(id)}
                      className={`flex-1 py-2.5 text-center border-b-2 -mb-px transition-colors ${
                        rightTab === id
                          ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                          : "border-transparent hover:text-foreground"
                      }`}
                    >
                      {label}
                      {id === "screenshots" && screenshots.length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">{screenshots.length}</span>
                      )}
                      {id === "steps" && recordedSteps.length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">{recordedSteps.length}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {/* Screenshots tab */}
                  {rightTab === "screenshots" && (
                    screenshots.length === 0 ? (
                      <div className="text-center py-10 px-4 space-y-2">
                        <Camera className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          No screenshots yet. Use <b>Screenshot</b> or <b>Full page</b> in the header, then annotate with text, arrows, or crop.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {screenshots.map((shot, idx) => (
                          <button
                            key={shot.id}
                            onClick={() => setAnnotatingShot({ kind: "saved", shot })}
                            className="group relative border rounded-lg overflow-hidden aspect-[4/3] bg-muted/40 hover:ring-2 hover:ring-indigo-400 transition-all"
                            title="Click to annotate"
                          >
                            <img
                              src={`/api/files/${encodeURIComponent(shot.filePath)}`}
                              alt={`Screenshot ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                            {shot.annotatedFromId && (
                              <span className="absolute top-1 left-1 bg-indigo-600 text-white text-[8px] font-bold px-1 py-0.5 rounded">
                                Annotated
                              </span>
                            )}
                            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white">
                              <Pencil className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  )}

                  {/* Recordings list lives with the visual evidence */}
                  {rightTab === "screenshots" && recordings.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Video className="h-3 w-3" /> Recordings ({recordings.length})
                      </span>
                      {recordings.map((clip, idx) => (
                        <div key={clip.id} className="border rounded-lg overflow-hidden bg-background">
                          {clip.filePath && (
                            <video
                              controls
                              preload="metadata"
                              src={`/api/files/${encodeURIComponent(clip.filePath)}`}
                              className="w-full max-h-32 bg-black"
                            />
                          )}
                          <div className="px-2 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              Clip {idx + 1}
                              {clip.durationMs ? ` · ${Math.round(clip.durationMs / 1000)}s` : ""}
                            </span>
                            {clip.filePath && (
                              <a
                                href={`/api/files/${encodeURIComponent(clip.filePath)}`}
                                download={`recording-${idx + 1}.webm`}
                                className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                Download
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selectors tab */}
                  {rightTab === "selectors" && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowElementDrawer(true)}
                        className="w-full h-8 text-xs gap-1.5 mb-1"
                      >
                        <MousePointerClick className="h-3.5 w-3.5 text-indigo-500" /> Capture element selector
                      </Button>
                      {capturedElements.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8 px-4 leading-relaxed">
                          No selectors captured yet.
                        </p>
                      ) : (
                        capturedElements.map((el) => (
                          <div key={el.id} className="border rounded-lg p-2.5 space-y-1.5 bg-background">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-medium text-indigo-600 dark:text-indigo-400">{el.type} &middot; {el.tagName}</span>
                              <span className={`font-medium tabular-nums ${
                                el.reliabilityScore >= 90 ? "text-emerald-600 dark:text-emerald-400" :
                                el.reliabilityScore >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                              }`}>
                                {el.reliabilityScore}% stable
                              </span>
                            </div>
                            <p className="font-mono text-[10px] text-foreground bg-muted/60 p-1.5 rounded truncate" title={el.selector}>
                              {el.selector}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Steps tab (with assertion suggestions on top) */}
                  {rightTab === "steps" && (
                    <div className="space-y-3">
                      <div className="border border-indigo-200 dark:border-indigo-500/25 rounded-lg p-2.5 bg-indigo-50/50 dark:bg-indigo-500/[0.06] space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Suggested assertions
                        </span>
                        {getSuggestions().map((sug, idx) => (
                          <p key={idx} className="text-[11px] text-foreground leading-snug">
                            {sug}
                          </p>
                        ))}
                      </div>

                      <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] font-medium ${
                        stepRecording
                          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/[0.08] dark:text-red-400"
                          : "border-border bg-muted/40 text-muted-foreground"
                      }`}>
                        {stepRecording ? (
                          <>
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                            Recording your interactions as steps…
                          </>
                        ) : (
                          <>
                            <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                            Steps aren&apos;t being recorded. Hit <b>Record steps</b> in the header to capture a scenario.
                          </>
                        )}
                      </div>

                      {recordedSteps.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6 px-4 leading-relaxed">
                          No steps yet. Start step recording, then interact in the browser view to capture a replayable scenario.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {recordedSteps.map((step, idx) => (
                            <div key={step.id} className="flex gap-2.5 p-2.5 border rounded-lg bg-background">
                              <span className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 text-[10px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-foreground leading-snug">{step.actionDescription}</p>
                                <span className="text-[10px] font-mono text-muted-foreground">{step.actionType}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowManualStepDrawer(true)}
                        className="w-full h-7 text-[11px] text-indigo-600 dark:text-indigo-400 gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add step manually
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t px-3 py-2.5 shrink-0 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Bug className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  Evidence auto-attaches to bugs filed from this session
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* Shared bug creation form (same component + API path as Bug Reports page),
          pre-filled with live-session context and the latest screenshot. */}
      <CreateBugModal
        projectId={projectId}
        open={showBugDrawer}
        onClose={() => setShowBugDrawer(false)}
        onCreated={(bug) => {
          setToast({ message: `Defect ${bug.bugKey || ""} logged successfully!`, type: "success" })
        }}
        recordingSessionId={sessionId}
        sessionSteps={recordedSteps.map((s) => ({
          stepNumber: s.stepNumber,
          actionDescription: s.actionDescription,
          expectedResult: s.expectedResult,
        }))}
        initialValues={{
          actualResult: "Failure observed during live QA session.",
          environment: "Staging",
        }}
        sessionContext={{
          pageUrl: liveUrl,
          consoleLogs: consoleErrors.length > 0 ? consoleErrors.join("\n") : null,
          networkErrors: networkErrors.length > 0 ? networkErrors.join("\n") : null,
          screenshotPath: screenshots[screenshots.length - 1]?.filePath || null,
        }}
        initialAttachmentPaths={[
          ...(screenshots.length > 0
            ? [{
                filePath: screenshots[screenshots.length - 1].filePath,
                fileName: screenshots[screenshots.length - 1].filePath.split("/").pop() || "screenshot.png",
                kind: "image" as const,
              }]
            : []),
          ...(recordings.length > 0 && recordings[recordings.length - 1].filePath
            ? [{
                filePath: recordings[recordings.length - 1].filePath as string,
                fileName: (recordings[recordings.length - 1].filePath as string).split("/").pop() || "recording.webm",
                kind: "video" as const,
              }]
            : []),
        ]}
        // Full pool so a tester with many screenshots can pick which to attach.
        attachmentChoices={[
          ...screenshots.map((s) => ({
            filePath: s.filePath,
            fileName: s.filePath.split("/").pop() || "screenshot.png",
            kind: "image" as const,
          })),
          ...recordings
            .filter((r) => r.filePath)
            .map((r) => ({
              filePath: r.filePath as string,
              fileName: (r.filePath as string).split("/").pop() || "recording.webm",
              kind: "video" as const,
            })),
        ]}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          DRAWER: MANUAL STEP BUILDER
          ═══════════════════════════════════════════════════════════════════════ */}
      {showManualStepDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[450px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b flex items-center justify-between bg-accent/15">
              <h3 className="font-bold text-base flex items-center gap-1.5">
                <Plus className="h-5 w-5 text-indigo-500" /> Add Step Manually
              </h3>
              <button onClick={() => setShowManualStepDrawer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualStep} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <Label htmlFor="man-desc">Action Description *</Label>
                <Input id="man-desc" value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} required placeholder="e.g. Click Submit registration Form" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="man-action">Action Type</Label>
                  <select id="man-action" value={manualActionType} onChange={(e) => setManualActionType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="click">Click</option>
                    <option value="fill">Input value</option>
                    <option value="navigate">Navigate URL</option>
                    <option value="hover">Hover</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="man-target">Target Type</Label>
                  <select id="man-target" value={manualTargetType} onChange={(e) => setManualTargetType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="button">Button</option>
                    <option value="input">Input field</option>
                    <option value="link">Link</option>
                    <option value="select">Dropdown select</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="man-tval">Target Selector Value</Label>
                <Input id="man-tval" value={manualTargetValue} onChange={(e) => setManualTargetValue(e.target.value)} placeholder="e.g. #submit-btn" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="man-ival">Input Value (if applicable)</Label>
                <Input id="man-ival" value={manualInputValue} onChange={(e) => setManualInputValue(e.target.value)} placeholder="e.g. john@example.com" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="man-exp">Expected Result</Label>
                <textarea id="man-exp" value={manualExpected} onChange={(e) => setManualExpected(e.target.value)} placeholder="Application navigates to dashboard and success message appears" className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs" />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowManualStepDrawer(false)}>Cancel</Button>
                <Button type="submit">Append Step</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DRAWER: SMART ELEMENT CAPTURE ANALYZER
          ═══════════════════════════════════════════════════════════════════════ */}
      {showElementDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[450px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b flex items-center justify-between bg-accent/15">
              <h3 className="font-bold text-base flex items-center gap-1.5">
                <Layers className="h-5 w-5 text-indigo-500" /> Capture Element Selector
              </h3>
              <button onClick={() => setShowElementDrawer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs font-semibold">
              <div className="space-y-1.5">
                <Label htmlFor="el-sel">Element Selector *</Label>
                <Input id="el-sel" value={capSelector} onChange={(e) => setCapSelector(e.target.value)} required placeholder="e.g. [data-testid='submit-login'] or #username" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="el-type">Selector Type</Label>
                  <select id="el-type" value={capType} onChange={(e) => setCapType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="CSS">CSS Selector</option>
                    <option value="XPath">XPath Query</option>
                    <option value="ID">Standard ID</option>
                    <option value="Attribute">Data Attribute</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-tag">Tag Name</Label>
                  <Input id="el-tag" value={capTagName} onChange={(e) => setCapTagName(e.target.value)} placeholder="e.g. button" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="el-text">Visible Text Selector</Label>
                <Input id="el-text" value={capText} onChange={(e) => setCapText(e.target.value)} placeholder="e.g. Login" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="el-attr">Additional Attributes</Label>
                <Input id="el-attr" value={capAttributes} onChange={(e) => setCapAttributes(e.target.value)} placeholder="e.g. type='submit'" />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowElementDrawer(false)}>Cancel</Button>
                <Button onClick={handleSaveElement} className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Selector</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot annotation editor: anchored text labels, rectangles,
          highlights, arrows, blur, crop, with undo/redo and per-annotation
          select/move/delete. Exports at natural resolution. */}
      {annotatingShot && (
        <AnnotationEditor
          imageSrc={
            annotatingShot.kind === "draft"
              ? annotatingShot.imageData
              : `/api/files/${encodeURIComponent(annotatingShot.shot.filePath)}`
          }
          onSave={handleSaveAnnotatedShot}
          onCancel={() => setAnnotatingShot(null)}
          saving={savingAnnotation}
        />
      )}
      {/* REMOTE FILE CHOOSER DIALOG OVERLAY */}
      {showFileChooserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs select-none">
          <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-sm p-6 space-y-4 text-left animate-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Camera size={14} className="text-indigo-650" /> Upload File to Browser
              </h3>
              <button
                onClick={handleCancelFileChooser}
                className="text-slate-400 hover:text-slate-650 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                The web page in the remote browser requested a file upload. Choose a local file to forward to it:
              </p>

              <div className="border-2 border-dashed border-slate-200 hover:border-slate-350 rounded-2xl p-6 transition-all bg-slate-50/50 hover:bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer relative">
                <Input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                {uploadingFile ? (
                  <>
                    <Loader2 size={24} className="text-indigo-600 animate-spin" />
                    <span className="text-[10px] font-black text-indigo-750 uppercase">Uploading file...</span>
                  </>
                ) : (
                  <>
                    <div className="p-2.5 rounded-2xl bg-white border shadow-3xs text-slate-450">
                      <Camera size={20} />
                    </div>
                    <span className="text-[10.5px] font-black text-slate-800 uppercase tracking-wide">Select Local File</span>
                    <span className="text-[9px] font-bold text-slate-450">Drag and drop or click here</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={handleCancelFileChooser}
                disabled={uploadingFile}
                className="flex-1 rounded-xl h-9 text-xs font-black border-slate-200 text-slate-650 bg-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
