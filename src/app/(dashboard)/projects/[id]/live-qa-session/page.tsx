"use client"

import { useEffect, useState, useRef, useMemo} from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AnnotationEditor } from "@/components/live-qa/annotation-editor"
import { CreateBugModal, type SessionAttachment } from "@/components/bug-reports/create-bug-modal"
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
  MousePointerClick,
  Copy,
  Check,
  Smartphone,
  Tablet as TabletIcon,
  Laptop,
  Lock,
  Download,
  Eye,
  Clock,
  Code,
  ListOrdered,
  FileCheck,
  AlertCircle
} from "lucide-react"
import { generatePlaywrightCode } from "@/lib/recording/code-generators"

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
  const [diagnosticTab, setDiagnosticTab] = useState<"console" | "network">("console")

  // Interactive capture overlay drawers
  const [showBugDrawer, setShowBugDrawer] = useState(false)
  const [showManualStepDrawer, setShowManualStepDrawer] = useState(false)
  const [showElementDrawer, setShowElementDrawer] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  // Snapshot taken before the session state is cleared, so the summary shows
  // what the session actually produced (it used to read the cleared state and
  // always said 0 / 0 / 0).
  const [completionSummary, setCompletionSummary] = useState<{
    sessionId: string
    steps: number
    shots: number
    videos: number
    consoleErrors: number
    networkErrors: number
    testCases: { id: string; title: string }[]
  } | null>(null)
  const [endingSession, setEndingSession] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Manual step form state
  const [manualDescription, setManualDescription] = useState("")
  const [manualActionType, setManualActionType] = useState("click")
  const [manualTargetType, setManualTargetType] = useState("css")
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

  // Screenshot gallery
  const [screenshots, setScreenshots] = useState<SessionShot[]>([])
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [annotatingShot, setAnnotatingShot] = useState<AnnotatingTarget | null>(null)
  const [savingAnnotation, setSavingAnnotation] = useState(false)
  const [previewShotUrl, setPreviewShotUrl] = useState<string | null>(null)

  // Video recording
  const [recording, setRecording] = useState(false)
  const [uploadingRecording, setUploadingRecording] = useState(false)
  const [stepRecording, setStepRecording] = useState(false)
  const [togglingSteps, setTogglingSteps] = useState(false)
  const [recStartedAt, setRecStartedAt] = useState<number | null>(null)
  const [recordings, setRecordings] = useState<SessionClip[]>([])
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)

  // Session timers + layout state
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const [fullView, setFullView] = useState(false)
  const [rightTab, setRightTab] = useState<"steps" | "screenshots" | "videos" | "selectors" | "diagnostics">("steps")
  const [showFileChooserModal, setShowFileChooserModal] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  // Embedded live browser
  const [showLivePreview, setShowLivePreview] = useState(true)
  const [hasFrame, setHasFrame] = useState(false)
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
  const hasFrameRef = useRef(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const inputQueueRef = useRef<Promise<any>>(Promise.resolve())
  const lastMoveSentRef = useRef(0)
  const lastPasteSentRef = useRef(0)
  const frameDsfRef = useRef(1)
  // The remote viewport size this client last asked for (CSS px). Pointer
  // coordinates are scaled into it, so frame resolution never affects clicks.
  const remoteViewportRef = useRef<{ width: number; height: number } | null>(null)
  // True while a streamed frame is decoding; incoming frames are dropped until
  // it clears so a slow client sheds rate instead of accumulating lag.
  const decodingFrameRef = useRef(false)

  // Timers & Pollers
  const pollerRef = useRef<any>(null)
  const statsPollerRef = useRef<any>(null)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Timer ticker
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Initial load & Recovery
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const projRes = await fetch(`/api/projects/${projectId}`)
        if (projRes.ok) {
          const projData = await projRes.json()
          setProject(projData.project)
          setStartUrl(projData.project?.webAppUrl || "")
          setTitle(`Exploratory QA Session — ${new Date().toLocaleDateString()}`)
        }

        const recoverRes = await fetch(`/api/recording/sessions/active?projectId=${projectId}`)
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

  // Polling management when session is active
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
    pollerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/recording/${sessionId}/steps`)
        if (res.ok) {
          const data = await res.json()
          setRecordedSteps(data.steps || [])
        }
      } catch {}
    }, 1500)

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

  // Reset frame state when session changes
  useEffect(() => {
    hasFrameRef.current = false
    setHasFrame(false)
  }, [sessionId])

  // ── Frame Painting & Stream ──────────────────────────────────────────────
  const handleFrameData = (rawImg: string, pageUrl?: string, dsf?: number) => {
    if (dsf && Number.isFinite(dsf) && dsf > 0) frameDsfRef.current = dsf
    const img = imgRef.current
    if (img) {
      img.src = rawImg.startsWith("data:") ? rawImg : `data:image/png;base64,${rawImg}`
    }
    hasFrameRef.current = true
    setHasFrame(true)
    if (pageUrl && pageUrl !== liveUrl) {
      setLiveUrl(pageUrl)
    }
    if (recordingRef.current && img && img.naturalWidth) {
      drawToCanvas(img.naturalWidth, img.naturalHeight, (ctx) => ctx.drawImage(img, 0, 0))
    }
  }

  const drawToCanvas = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = liveCanvasRef.current
    if (!canvas) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext("2d")
    if (ctx) draw(ctx)
  }

  async function fetchLiveFrame() {
    if (!sessionId || frameBusyRef.current) return
    frameBusyRef.current = true
    try {
      const res = await fetch(`/api/recording/${sessionId}/frame`)
      if (res.ok) {
        const data = await res.json()
        const frameStr = data.frame || data.imageData
        if (frameStr) {
          handleFrameData(frameStr, data.url || data.pageUrl, data.dsf)
        }
      }
    } catch {} finally {
      frameBusyRef.current = false
    }
  }

  // Live WebSocket Connection (Zero-Lag 30 FPS Stream)
  useEffect(() => {
    if (!sessionId || sessionStatus !== "Active" || !showLivePreview) return

    let isMounted = true
    let prevBlobUrl: string | null = null

    async function startStream() {
      try {
        setStreamMode("connecting")
        const tokenRes = await fetch(`/api/recording/${sessionId}/stream-token`, { method: "POST" })
        if (!tokenRes.ok) throw new Error("Failed token mint")
        const tokenData = await tokenRes.json()
        if (!isMounted || !tokenData.wsUrl) return

        const ws = new WebSocket(tokenData.wsUrl)
        ws.binaryType = "blob"
        wsRef.current = ws

        ws.onopen = () => {
          if (isMounted) setStreamMode("streaming")
        }

        ws.onmessage = (event) => {
          if (!isMounted) return
          if (event.data instanceof Blob) {
            // Drop a frame rather than queue it when the previous one is still
            // decoding, or when the tab is hidden. Decoding every frame on a
            // client that can't keep up turns a bandwidth spike into unbounded,
            // ever-growing latency — the view drifts further behind the browser
            // the longer you scroll. Skipping keeps it live at a lower rate.
            if (decodingFrameRef.current || document.hidden) return
            decodingFrameRef.current = true
            const url = URL.createObjectURL(event.data)
            if (imgRef.current) {
              imgRef.current.src = url
            } else {
              decodingFrameRef.current = false
            }
            if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl)
            prevBlobUrl = url
            hasFrameRef.current = true
            setHasFrame(true)
          } else if (typeof event.data === "string") {
            try {
              const msg = JSON.parse(event.data)
              if (msg.type === "url" && msg.url) {
                setLiveUrl(msg.url)
              } else if (msg.type === "file_chooser_requested") {
                setShowFileChooserModal(true)
              }
            } catch {}
          }
        }

        ws.onerror = () => {
          if (isMounted) setStreamMode("polling")
        }

        ws.onclose = () => {
          if (isMounted) setStreamMode("polling")
        }
      } catch {
        if (isMounted) setStreamMode("polling")
      }
    }

    startStream()

    // High-performance polling fallback (120ms) if WS drops
    framePollerRef.current = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        fetchLiveFrame()
      }
    }, 120)

    return () => {
      isMounted = false
      if (framePollerRef.current) clearInterval(framePollerRef.current)
      if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [sessionId, sessionStatus, showLivePreview])

  const fmtElapsed = (start: number | null) => {
    if (!start) return "00:00"
    const secs = Math.max(0, Math.floor((nowTick - start) / 1000))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const sec = secs % 60
    const mm = String(m).padStart(2, "0")
    const ss = String(sec).padStart(2, "0")
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  /**
   * Session captures in the shape the bug form expects.
   *
   * When a screenshot has been annotated, only the annotated version is
   * offered — attaching both the marked-up image and its unmarked original
   * just makes the report noisier.
   */
  const sessionAttachments = useMemo<SessionAttachment[]>(() => {
    const annotatedOriginals = new Set(
      screenshots.map((s) => s.annotatedFromId).filter(Boolean) as string[]
    )
    const shots: SessionAttachment[] = screenshots
      .filter((s) => s.filePath && !annotatedOriginals.has(s.id))
      .map((s, i) => ({
        filePath: s.filePath,
        fileName: s.filePath.split("/").pop() || `screenshot-${i + 1}.png`,
        kind: "image" as const,
      }))
    const clips: SessionAttachment[] = recordings
      .filter((r) => !!r.filePath)
      .map((r, i) => ({
        filePath: r.filePath as string,
        fileName: (r.filePath as string).split("/").pop() || `recording-${i + 1}.webm`,
        kind: "video" as const,
      }))
    return [...shots, ...clips]
  }, [screenshots, recordings])

  // Load screenshots & recordings
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

  useEffect(() => {
    if (!urlEditingRef.current && liveUrl) setUrlInput(liveUrl)
  }, [liveUrl])

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

  /**
   * Map a pointer event to remote-browser CSS pixels.
   *
   * Scales by the ratio between the remote viewport (which this client asked
   * for via the `resize` message) and the element's displayed box, so the
   * mapping holds no matter what resolution the frames arrive at. Dividing by
   * `zoom` alone only worked while frames happened to be displayed 1:1, which
   * broke as soon as the stream was downscaled to save bandwidth.
   */
  function liveViewCoords(e: { clientX: number; clientY: number }) {
    const mapWithin = (rect: DOMRect) => {
      if (rect.width <= 0 || rect.height <= 0) return null
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return null
      }
      const remote = remoteViewportRef.current
      const z = zoom || 1
      // Fall back to the zoom-only mapping until the first resize is sent.
      const scaleX = remote ? remote.width / rect.width : 1 / z
      const scaleY = remote ? remote.height / rect.height : 1 / z
      return {
        x: Math.round((e.clientX - rect.left) * scaleX),
        y: Math.round((e.clientY - rect.top) * scaleY)
      }
    }

    const img = imgRef.current
    if (img) {
      const hit = mapWithin(img.getBoundingClientRect())
      if (hit) return hit
    }
    const canvas = liveCanvasRef.current
    if (canvas) {
      const hit = mapWithin(canvas.getBoundingClientRect())
      if (hit) return hit
    }
    return null
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

  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3
  const ZOOM_STEP = 0.1
  function applyZoom(next: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100))
    setZoom(clamped)
    setZoomText(String(Math.round(clamped * 100)))
  }

  function commitZoomText() {
    const n = parseInt(zoomText, 10)
    if (Number.isFinite(n) && n > 0) applyZoom(n / 100)
    else setZoomText(String(Math.round(zoom * 100)))
  }

  useEffect(() => {
    const el = liveViewRef.current
    if (!el || !sessionId || sessionStatus !== "Active" || !showLivePreview) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const sendResize = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 320 || rect.height < 320) return
      const width = Math.round(rect.width / zoom)
      const height = Math.round(rect.height / zoom)
      remoteViewportRef.current = { width, height }
      sendBrowserInput({ type: "resize", width, height })
    }

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
  }, [sessionId, sessionStatus, showLivePreview, fullView, zoom])

  // ── Session Controls ───────────────────────────────────────────────────────
  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startUrl.trim()) {
      setStartError("Session Name and Target URL are required")
      return
    }

    try {
      const targetHost = new URL(startUrl).hostname.toLowerCase()
      const isLoopback = (h: string) =>
        h === "localhost" || h === "0.0.0.0" || h === "::1" || h.endsWith(".localhost") || /^127\./.test(h)
      if (isLoopback(targetHost) && !isLoopback(window.location.hostname.toLowerCase())) {
        setStartError(
          `"${startUrl}" points to localhost, which isn't reachable from this server. Enter a publicly accessible URL.`
        )
        return
      }
    } catch {}

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
        setToast({ message: "Live browser workstation launched! Interact directly in the viewport below.", type: "success" })
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
    setEndingSession(true)
    if (mediaRecorderRef.current) {
      try {
        await Promise.race([
          handleStopRecording(),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ])
      } catch {}
    }
    const action = finish ? "finish" : "cancel"
    const endedSessionId = sessionId
    const snapshot = {
      steps: recordedSteps.filter((s: any) => s.actionType !== "open_url").length,
      shots: screenshots.length,
      videos: recordings.length,
      consoleErrors: consoleErrors.length,
      networkErrors: networkErrors.length,
    }
    try {
      const res = await fetch(`/api/recording/${sessionId}/${action}`, { method: "POST" })
      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        setCompletionSummary({
          sessionId: endedSessionId,
          ...snapshot,
          testCases: Array.isArray(body.testCases) ? body.testCases : [],
        })
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
        if (finish) {
          setShowCompletionModal(true)
        } else {
          setToast({ message: "Session cancelled.", type: "success" })
        }
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.error || "Failed to end session", type: "error" })
      }
    } catch {
      setToast({ message: "Network error ending session", type: "error" })
    } finally {
      setEndingSession(false)
    }
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
      const img = imgRef.current
      if (img && img.naturalWidth) {
        drawToCanvas(img.naturalWidth, img.naturalHeight, (ctx) => ctx.drawImage(img, 0, 0))
      }
      recordingRef.current = true

      const stream = canvas.captureStream(30)
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      )
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recChunksRef.current = []

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recChunksRef.current.push(ev.data)
      }
      recorder.start(1000)
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecStartedAt(Date.now())
      setToast({ message: "Video recording started — perform your test flow below", type: "success" })
    } catch {
      recordingRef.current = false
      setToast({ message: "Failed to start media recorder", type: "error" })
    }
  }

  async function handleStopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === "inactive") return
    setUploadingRecording(true)
    recordingRef.current = false
    const startT = recStartedAt || Date.now()

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const blob = new Blob(recChunksRef.current, { type: recorder.mimeType || "video/webm" })
          recChunksRef.current = []
          mediaRecorderRef.current = null
          const formData = new FormData()
          formData.append("file", blob, `video-${Date.now()}.webm`)
          formData.append("durationMs", String(Math.max(0, Date.now() - startT)))

          const res = await fetch(`/api/recording/${sessionId}/recordings`, {
            method: "POST",
            body: formData,
          })
          if (res.ok) {
            const data = await res.json()
            setRecordings((prev) => [...prev, data.recording])
            setToast({ message: "Video clip saved to session evidence gallery!", type: "success" })
          } else {
            setToast({ message: "Failed to upload video clip", type: "error" })
          }
        } catch {
          setToast({ message: "Network error saving video clip", type: "error" })
        } finally {
          setRecording(false)
          setRecStartedAt(null)
          setUploadingRecording(false)
          resolve()
        }
      }
      recorder.stop()
    })
  }

  async function handleToggleStepRecording() {
    if (!sessionId) return
    setTogglingSteps(true)
    const nextState = !stepRecording
    try {
      const res = await fetch(`/api/recording/${sessionId}/step-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState })
      })
      if (res.ok) {
        setStepRecording(nextState)
        setToast({
          message: nextState
            ? "Scenario step recording ACTIVE — clicks and fills will be captured into your step timeline"
            : "Scenario step recording PAUSED",
          type: "success"
        })
      }
    } catch {
      setToast({ message: "Failed to toggle step recording", type: "error" })
    } finally {
      setTogglingSteps(false)
    }
  }

  async function handleAddManualStep(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionId || !manualDescription.trim()) return
    try {
      const res = await fetch(`/api/recording/${sessionId}/manual-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionDescription: manualDescription,
          actionType: manualActionType,
          targetType: manualTargetType,
          targetValue: manualTargetValue || null,
          inputValue: manualInputValue || null,
          expectedResult: manualExpected || null
        })
      })

      if (res.ok) {
        const data = await res.json()
        setRecordedSteps((prev) => [...prev, data.step])
        setShowManualStepDrawer(false)
        setManualDescription("")
        setManualTargetValue("")
        setManualInputValue("")
        setManualExpected("")
        setToast({ message: "Manual step appended to timeline!", type: "success" })
      }
    } catch {
      setToast({ message: "Failed to add step", type: "error" })
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/recording/${sessionId}/steps/${stepId}`, { method: "DELETE" })
      if (res.ok) {
        setRecordedSteps((prev) => prev.filter((s) => s.id !== stepId))
        setToast({ message: "Step deleted from timeline", type: "success" })
      }
    } catch {}
  }

  async function handleSaveElement() {
    if (!capSelector.trim()) return
    const newEl = {
      id: String(Date.now()),
      selector: capSelector,
      type: capType,
      tagName: capTagName,
      text: capText,
      attributes: capAttributes
    }
    setCapturedElements((prev) => [newEl, ...prev])
    setShowElementDrawer(false)
    setCapSelector("")
    setCapText("")
    setCapAttributes("")
    setToast({ message: "Locator saved to selector repository!", type: "success" })
  }

  function handleCopyPlaywrightCode() {
    if (recordedSteps.length === 0) {
      setToast({ message: "No recorded steps to generate code from.", type: "error" })
      return
    }
    const neutralSteps = recordedSteps.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      actionType: s.actionType,
      description: s.actionDescription,
      url: s.pageUrl,
      playwrightLocator: s.recommendedSelector ? `locator('${s.recommendedSelector}')` : null,
      shaftBy: null,
      inputValue: s.inputValue,
      assertionType: null,
      assertionValue: s.expectedResult,
    }))
    const code = generatePlaywrightCode(neutralSteps, title || "Live QA Session")
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setToast({ message: "TypeScript Automation Code copied to clipboard!", type: "success" })
    setTimeout(() => setCopiedCode(false), 3000)
  }

  // Quick Preset Handlers
  const applyPreset = (p: { title: string; browser: "Chromium" | "Firefox" | "WebKit"; viewport: "Desktop" | "Tablet" | "Mobile"; priority: string }) => {
    setTitle(p.title)
    setBrowserType(p.browser)
    setViewport(p.viewport)
    setPriority(p.priority)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-background">

      {/* End session confirmation */}
      <ConfirmDialog
        open={showEndConfirm}
        title="End live testing session?"
        description="This closes the controlled browser and ends the session without converting it into a test case. Captured bugs and screenshots will be retained."
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
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-top duration-300 max-w-md ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100" 
            : "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100"
        }`}>
          <span className="text-xs font-bold flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground animate-pulse font-semibold">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          <span>Initializing Live QA Workstation...</span>
        </div>
      ) : !sessionId ? (
        
        // ═════════════════════════════════════════════════════════════════════
        // INITIAL WORKSTATION SETUP FORM (REDESIGNED FULL-WIDTH 2-COLUMN)
        // ═════════════════════════════════════════════════════════════════════
        <div className="flex-1 overflow-y-auto w-full max-w-7xl mx-auto px-8 py-8 space-y-8 select-none text-xs font-medium">
          
          {/* Header Banner - Full Width */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-8 text-white shadow-2xl border border-indigo-500/20">
            <div className="absolute -top-12 -right-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    <Sparkles className="h-3 w-3" /> Interactive Manual Workstation
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" /> Zero-Lag 30 FPS Stream
                  </span>
                </div>

                <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                  <Zap className="h-8 w-8 text-indigo-400 fill-current" /> Live QA Testing Workstation
                </h1>
                <p className="text-xs text-slate-300 font-normal leading-relaxed">
                  Launch an isolated high-definition browser workstation session embedded right inside this workspace. Perform exploratory manual validation, record replay steps, stream live video, inspect locators, and file bugs with 1-click evidence.
                </p>

                {/* Presets Bar */}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyPreset({ title: "Quick Exploratory Smoke Test", browser: "Chromium", viewport: "Desktop", priority: "High" })}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-slate-200 border border-white/10 transition-all flex items-center gap-1.5 hover:scale-105"
                  >
                    <Zap size={12} className="text-amber-400" /> Smoke Test
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset({ title: "Mobile Responsiveness Audit", browser: "WebKit", viewport: "Mobile", priority: "Medium" })}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-slate-200 border border-white/10 transition-all flex items-center gap-1.5 hover:scale-105"
                  >
                    <Smartphone size={12} className="text-indigo-400" /> Mobile Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset({ title: "Role Security & Permissions Audit", browser: "Firefox", viewport: "Desktop", priority: "Critical" })}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-slate-200 border border-white/10 transition-all flex items-center gap-1.5 hover:scale-105"
                  >
                    <ShieldCheck size={12} className="text-emerald-400" /> Security Audit
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => router.push(`/projects/${projectId}/live-qa-history`)}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-2xl border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-bold transition-all text-white backdrop-blur-md shadow-lg"
                >
                  <Activity className="h-4 w-4 text-indigo-300" /> Session History &amp; Artifacts
                </button>
              </div>
            </div>
          </div>

          {/* 2-Column Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Form Column (8 columns / 66% width) */}
            <div className="lg:col-span-8 space-y-6">
              <form onSubmit={handleStartSession} className="space-y-6">
                
                {/* Session Identity Card */}
                <div className="p-6 rounded-2xl border bg-card space-y-4 shadow-sm">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-500" /> Session Identity &amp; Scope
                  </h3>

                  <div className="space-y-1.5">
                    <Label htmlFor="work-title" className="font-bold text-xs">Session / Test Case Title *</Label>
                    <Input
                      id="work-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder="e.g. Verify Checkout Payment Gateway with 3DS Challenge"
                      className="h-10 text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="work-url" className="font-bold text-xs">Target Startup URL *</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="work-url"
                        value={startUrl}
                        onChange={(e) => setStartUrl(e.target.value)}
                        required
                        placeholder="https://example.com/login"
                        className="pl-9 h-10 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-bold text-xs">Default Test Priority</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {["Low", "Medium", "High", "Critical"].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`h-9 rounded-xl border text-xs font-extrabold transition-all ${
                            priority === p
                              ? p === "Critical"
                                ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                : p === "High"
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-background text-muted-foreground border-input hover:bg-muted"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Browser & Viewport Platform Selection Grid */}
                <div className="p-6 rounded-2xl border bg-card space-y-5 shadow-sm">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-indigo-500" /> Browser Engine &amp; Device Configuration
                  </h3>

                  {/* Browser Cards */}
                  <div className="space-y-2">
                    <Label className="font-bold text-xs">QA Browser Engine</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "Chromium", label: "Chromium", desc: "Chrome / Edge CDP Engine" },
                        { id: "Firefox", label: "Mozilla Firefox", desc: "Gecko Browser Engine" },
                        { id: "WebKit", label: "Apple WebKit", desc: "Safari Browser Engine" }
                      ].map((b) => (
                        <div
                          key={b.id}
                          onClick={() => setBrowserType(b.id as any)}
                          className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                            browserType === b.id
                              ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-600/20 shadow-sm"
                              : "border-input bg-background hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-extrabold text-xs text-foreground">{b.label}</span>
                            {browserType === b.id && <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{b.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Viewport Cards */}
                  <div className="space-y-2">
                    <Label className="font-bold text-xs">Target Device Layout</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "Desktop", label: "Desktop Workspace", dim: "1280 × 800", icon: Laptop },
                        { id: "Tablet", label: "Tablet Device", dim: "768 × 1024", icon: TabletIcon },
                        { id: "Mobile", label: "Mobile Device", dim: "375 × 667", icon: Smartphone }
                      ].map((v) => {
                        const Icon = v.icon
                        return (
                          <div
                            key={v.id}
                            onClick={() => setViewport(v.id as any)}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                              viewport === v.id
                                ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-600/20 shadow-sm"
                                : "border-input bg-background hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <Icon className={`h-4 w-4 ${viewport === v.id ? "text-indigo-600" : "text-muted-foreground"}`} />
                              <span className="font-extrabold text-xs text-foreground">{v.label}</span>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">{v.dim}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Credentials & Preconditions */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="work-cred" className="font-bold text-xs">Pre-Authenticated Role Context</Label>
                      <select
                        id="work-cred"
                        value={credentialId}
                        onChange={(e) => setCredentialId(e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-semibold"
                      >
                        <option value="">-- Anonymous / No Login --</option>
                        {project?.credentials.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.roleName} ({c.username})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="work-precond" className="font-bold text-xs">Preconditions</Label>
                      <Input
                        id="work-precond"
                        value={preconditions}
                        onChange={(e) => setPreconditions(e.target.value)}
                        placeholder="e.g. Active subscription with $50 balance"
                        className="h-10 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {startError && (
                  <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 flex items-center gap-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                    <p className="text-xs font-bold">{startError}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={startingSession}
                  className="w-full flex items-center justify-center gap-2 font-black h-12 text-sm rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-xl shadow-indigo-500/25 transition-all cursor-pointer"
                >
                  {startingSession ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Spinning up Headless Browser Workstation...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 fill-current" />
                      <span>Launch Live QA Browser Workstation</span>
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Right Sidebar Intelligence Column (4 columns / 34% width) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Launch Configuration Summary */}
              <div className="p-6 rounded-2xl border bg-card space-y-4 shadow-sm">
                <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" /> Workstation Status &amp; Specs
                </h3>

                <div className="space-y-3 divide-y divide-border/50 text-xs">
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">Engine</span>
                    <span className="font-black text-foreground bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">{browserType}</span>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">Resolution</span>
                    <span className="font-mono font-bold text-foreground">{viewport === "Desktop" ? "1280 × 800" : viewport === "Tablet" ? "768 × 1024" : "375 × 667"}</span>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">Quality &amp; Frame Rate</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">95 HD • 30 FPS</span>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">Protocol Stream</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">CDP WebSocket</span>
                  </div>
                </div>
              </div>



              {/* Features & Guidelines Card */}
              <div className="p-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/30 space-y-3">
                <div className="flex items-center gap-2 font-extrabold text-xs text-indigo-950 dark:text-indigo-200">
                  <Info className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Workstation Capabilities</span>
                </div>
                <ul className="space-y-2 text-[11px] text-indigo-900 dark:text-indigo-300 leading-relaxed font-medium list-disc list-inside">
                  <li><b>Step Recording</b>: Captures clicks and typing directly into TypeScript automation scripts.</li>
                  <li><b>1-Click Bug Reports</b>: Files issues pre-filled with screenshots, console logs, and step trace.</li>
                  <li><b>Live Network &amp; Console</b>: Monitor HTTP status codes and JS errors live in real time.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        
        // ═════════════════════════════════════════════════════════════════════
        // ACTIVE WORKSTATION (WORLD-CLASS WORKSPACE LAYOUT)
        // ═════════════════════════════════════════════════════════════════════
        <div className={fullView ? "fixed inset-0 z-40 bg-background flex flex-col min-h-0" : "flex-1 flex flex-col min-h-0"}>

          {/* ── Top Header Control Bar ── */}
          <header className="px-4 py-2 border-b bg-card flex items-center justify-between gap-3 shrink-0 flex-wrap shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                {sessionStatus === "Active" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  sessionStatus === "Active" ? "bg-emerald-500" : "bg-amber-500"
                }`} />
              </span>
              <div className="min-w-0">
                <h1 className="text-xs font-black text-foreground truncate max-w-xs flex items-center gap-1.5" title={title}>
                  {title}
                </h1>
                <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
                  <span className="uppercase text-[9px] px-1.5 py-0.2 rounded bg-muted font-extrabold">{browserType}</span>
                  <span>&middot;</span>
                  <span>{connectionStatus}</span>
                  <span>&middot;</span>
                  <Clock size={11} className="text-indigo-500" />
                  <span className="tabular-nums font-bold text-foreground">{fmtElapsed(sessionStartedAt)}</span>
                </p>
              </div>
            </div>

            {/* Control Button Clusters */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* Cluster: Screenshot Capture */}
              <div className="flex items-center rounded-xl border bg-muted/40 p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTakeScreenshot(false)}
                  disabled={capturingScreenshot}
                  className="h-7 px-2.5 text-[11px] font-bold gap-1 text-foreground hover:bg-background"
                  title="Capture visible viewport & annotate"
                >
                  {capturingScreenshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 text-indigo-500" />}
                  <span>Screenshot</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTakeScreenshot(true)}
                  disabled={capturingScreenshot}
                  className="h-7 px-2.5 text-[11px] font-bold gap-1 text-foreground hover:bg-background"
                  title="Capture entire scrollable page"
                >
                  <Maximize className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Full Page</span>
                </Button>
              </div>

              {/* Cluster: Video & Step Recording */}
              <div className="flex items-center rounded-xl border bg-muted/40 p-0.5 gap-1">
                {stepRecording ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleStepRecording}
                    disabled={togglingSteps}
                    className="h-7 px-2.5 text-[11px] font-extrabold gap-1 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50"
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                    <span>Steps ({recordedSteps.length})</span>
                    <Square size={10} className="fill-current" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleStepRecording}
                    disabled={togglingSteps}
                    className="h-7 px-2.5 text-[11px] font-bold gap-1 text-foreground hover:bg-background"
                    title="Record user clicks and inputs into step timeline"
                  >
                    <MousePointerClick className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Record Steps</span>
                  </Button>
                )}

                {recording ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStopRecording}
                    className="h-7 px-2.5 text-[11px] font-extrabold gap-1 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50"
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="tabular-nums">{fmtElapsed(recStartedAt)}</span>
                    <Square size={10} className="fill-current" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStartRecording}
                    disabled={uploadingRecording}
                    className="h-7 px-2.5 text-[11px] font-bold gap-1 text-foreground hover:bg-background"
                    title="Record live browser view as WebM video clip"
                  >
                    {uploadingRecording ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5 text-indigo-500" />}
                    <span>Record Video</span>
                  </Button>
                )}
              </div>

              {/* Cluster: Bug & Diagnostics */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => setShowBugDrawer(true)}
                  className="h-7 px-3 text-[11px] font-extrabold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs"
                >
                  <Bug className="h-3.5 w-3.5" />
                  <span>Create Bug</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRightTab("diagnostics")}
                  className={`h-7 px-2.5 text-[11px] font-extrabold gap-1.5 rounded-xl ${
                    consoleErrors.length > 0 || networkErrors.length > 0
                      ? "border-rose-300 text-rose-600 bg-rose-50 dark:bg-rose-950/40"
                      : "border-input text-muted-foreground"
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Logs</span>
                  {(consoleErrors.length > 0 || networkErrors.length > 0) && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px]">
                      {consoleErrors.length + networkErrors.length}
                    </span>
                  )}
                </Button>
              </div>

              {/* Cluster: Completion */}
              <div className="flex items-center gap-1 border-l pl-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePauseResume}
                  className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                >
                  {sessionStatus === "Active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-emerald-500" />}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleEndSession(true)}
                  className="h-7 px-3 text-[11px] font-black gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Complete &amp; Save</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEndConfirm(true)}
                  className="h-7 px-2 text-muted-foreground hover:text-rose-600"
                  title="Cancel session"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

            </div>
          </header>

          {/* ── Main Workstation Deck ── */}
          <div className="flex-1 flex min-h-0">

            {/* Left/Center: Browser Viewport */}
            <main className={`flex-1 flex flex-col min-w-0 ${fullView ? "p-2" : "p-3 pr-1"}`}>
              <div className="flex-1 flex flex-col rounded-2xl border bg-card overflow-hidden shadow-md min-h-0">
                
                {/* Browser Address Control Bar */}
                <div className="px-3 py-2 border-b flex items-center gap-2 bg-slate-900 text-slate-200 shrink-0">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    <button
                      onClick={() => sendBrowserInput({ type: "back" })}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      title="Back"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => sendBrowserInput({ type: "forward" })}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      title="Forward"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={() => sendBrowserInput({ type: "reload" })}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      title="Reload"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>

                  {/* Address Bar */}
                  <div className="flex-1 flex items-center gap-1.5 h-7 rounded-lg bg-slate-950/80 px-2.5 border border-slate-800">
                    <Lock size={11} className="text-emerald-400 shrink-0" />
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
                      placeholder="Enter URL and press Enter..."
                      spellCheck={false}
                      className="flex-1 bg-transparent font-mono text-[11px] text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1 shrink-0 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800">
                    <button
                      onClick={() => applyZoom(zoom - ZOOM_STEP)}
                      disabled={zoom <= ZOOM_MIN}
                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                      title="Zoom Out"
                    >
                      <ZoomOut size={12} />
                    </button>
                    <input
                      value={zoomText}
                      onChange={(e) => setZoomText(e.target.value)}
                      onBlur={commitZoomText}
                      onKeyDown={(e) => { if (e.key === "Enter") commitZoomText() }}
                      className="w-8 bg-transparent text-center font-mono text-[10px] font-bold text-slate-300 focus:outline-none"
                    />
                    <span className="text-[10px] font-bold text-slate-500 mr-1">%</span>
                    <button
                      onClick={() => applyZoom(zoom + ZOOM_STEP)}
                      disabled={zoom >= ZOOM_MAX}
                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                      title="Zoom In"
                    >
                      <ZoomIn size={12} />
                    </button>
                  </div>

                  {/* Stream Mode Indicator */}
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                    {streamMode === "streaming" ? "CDP Stream" : streamMode}
                  </span>

                  <button
                    onClick={() => setFullView(!fullView)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                    title={fullView ? "Exit Fullscreen" : "Fullscreen View"}
                  >
                    {fullView ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>

                {/* Interactive Live Canvas Area */}
                <div
                  ref={liveViewRef}
                  tabIndex={0}
                  onMouseDown={(e) => {
                    liveViewRef.current?.focus()
                    const coords = liveViewCoords(e)
                    if (coords) {
                      sendBrowserInput({
                        type: "mousedown",
                        ...coords,
                        button: MOUSE_BUTTONS[e.button] || "left",
                        clickCount: e.detail || 1
                      })
                    }
                  }}
                  onMouseUp={(e) => {
                    const coords = liveViewCoords(e)
                    if (coords) {
                      sendBrowserInput({
                        type: "mouseup",
                        ...coords,
                        button: MOUSE_BUTTONS[e.button] || "left",
                        clickCount: e.detail || 1
                      })
                    }
                  }}
                  onMouseMove={(e) => {
                    const now = Date.now()
                    if (now - lastMoveSentRef.current < 40) return
                    lastMoveSentRef.current = now
                    const coords = liveViewCoords(e)
                    if (coords) sendBrowserInput({ type: "mousemove", ...coords })
                  }}
                  onKeyDown={(e) => {
                    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Backspace", "Space"].includes(e.key) || e.key === " ") {
                      e.preventDefault()
                    }
                    const key = mapKeyboardEvent(e)
                    if (key) {
                      sendBrowserInput({ type: "keydown", key, ctrlKey: e.ctrlKey, metaKey: e.metaKey })
                    }
                  }}
                  onKeyUp={(e) => {
                    const key = mapKeyboardEvent(e)
                    if (key) {
                      sendBrowserInput({ type: "keyup", key })
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData?.getData("text")
                    if (text) {
                      e.preventDefault()
                      sendBrowserInput({ type: "type", text })
                    }
                  }}
                  className="flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden outline-none cursor-crosshair group min-h-0"
                >
                  <canvas ref={liveCanvasRef} className="hidden" />

                  <img
                    ref={imgRef}
                    alt="Live QA Viewport Stream"
                    onLoad={() => {
                      decodingFrameRef.current = false
                      hasFrameRef.current = true
                      setHasFrame(true)
                    }}
                    onError={() => {
                      decodingFrameRef.current = false
                    }}
                    className="max-w-full max-h-full object-contain pointer-events-none select-none"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "center center",
                      imageRendering: "-webkit-optimize-contrast"
                    }}
                  />

                  {!hasFrame && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-950/90 backdrop-blur-xs">
                      <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                      <span className="text-xs font-bold text-slate-300">Connecting to Remote Browser Engine...</span>
                    </div>
                  )}

                  {/* Watermark / Guidance Overlay */}
                  <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-800 text-[10px] text-slate-300 font-semibold flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MousePointerClick size={12} className="text-indigo-400" />
                    <span>Interact directly in the screen above</span>
                  </div>
                </div>

              </div>
            </main>

            {/* Right Side Inspection Deck */}
            {!fullView && (
              <aside className="w-[380px] border-l bg-card flex flex-col shrink-0 min-h-0">
                
                {/* Tab Strip */}
                <div className="p-2 border-b bg-muted/30 grid grid-cols-5 gap-1 text-[11px] font-extrabold shrink-0">
                  <button
                    onClick={() => setRightTab("steps")}
                    className={`py-1.5 rounded-lg flex flex-col items-center gap-1 transition-all ${
                      rightTab === "steps" ? "bg-background text-indigo-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ListOrdered size={14} />
                    <span className="text-[10px]">Steps</span>
                  </button>

                  <button
                    onClick={() => setRightTab("screenshots")}
                    className={`py-1.5 rounded-lg flex flex-col items-center gap-1 transition-all ${
                      rightTab === "screenshots" ? "bg-background text-indigo-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Camera size={14} />
                    <span className="text-[10px]">Shots ({screenshots.length})</span>
                  </button>

                  <button
                    onClick={() => setRightTab("videos")}
                    className={`py-1.5 rounded-lg flex flex-col items-center gap-1 transition-all ${
                      rightTab === "videos" ? "bg-background text-indigo-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Video size={14} />
                    <span className="text-[10px]">Clips ({recordings.length})</span>
                  </button>

                  <button
                    onClick={() => setRightTab("selectors")}
                    className={`py-1.5 rounded-lg flex flex-col items-center gap-1 transition-all ${
                      rightTab === "selectors" ? "bg-background text-indigo-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Layers size={14} />
                    <span className="text-[10px]">Locators</span>
                  </button>

                  <button
                    onClick={() => setRightTab("diagnostics")}
                    className={`py-1.5 rounded-lg flex flex-col items-center gap-1 transition-all ${
                      rightTab === "diagnostics" ? "bg-background text-indigo-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Terminal size={14} />
                    <span className="text-[10px]">Logs</span>
                  </button>
                </div>

                {/* Tab Content Container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 text-xs">
                  
                  {/* TAB 1: REPLAY STEPS */}
                  {rightTab === "steps" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-xs uppercase tracking-wider">Scenario Step Timeline</span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCopyPlaywrightCode}
                            className="h-7 text-[10px] font-bold gap-1"
                          >
                            {copiedCode ? <Check size={12} className="text-emerald-500" /> : <Code size={12} />}
                            {copiedCode ? "Copied!" : "Export Code"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setShowManualStepDrawer(true)}
                            className="h-7 text-[10px] font-extrabold gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            <Plus size={12} /> Add Step
                          </Button>
                        </div>
                      </div>

                      {recordedSteps.length === 0 ? (
                        <div className="p-8 border border-dashed rounded-2xl text-center space-y-2 text-muted-foreground">
                          <MousePointerClick className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="font-bold text-xs">No steps captured yet.</p>
                          <p className="text-[11px] max-w-xs mx-auto">
                            Click <b>Record Steps</b> in the header toolbar to capture your live browser clicks &amp; inputs into steps.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {recordedSteps.map((step, idx) => (
                            <div key={step.id || idx} className="p-3 rounded-xl border bg-card hover:bg-muted/40 transition-all space-y-1.5 group relative">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 text-[10px] font-black">
                                    {step.stepNumber}
                                  </span>
                                  <span className="font-black text-xs text-foreground uppercase tracking-wide">
                                    {step.actionType}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteStep(step.id)}
                                  className="text-muted-foreground hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              <p className="font-medium text-xs text-foreground">{step.actionDescription}</p>

                              {step.recommendedSelector && (
                                <p className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 p-1.5 rounded-lg truncate">
                                  {step.recommendedSelector}
                                </p>
                              )}

                              {step.inputValue && (
                                <p className="text-[11px] text-muted-foreground">
                                  Input: <span className="font-semibold text-foreground">&quot;{step.inputValue}&quot;</span>
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: SCREENSHOTS GALLERY */}
                  {rightTab === "screenshots" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-xs uppercase tracking-wider">Evidentiary Screenshots</span>
                        <Button
                          size="sm"
                          onClick={() => handleTakeScreenshot(false)}
                          className="h-7 text-[10px] font-extrabold gap-1 bg-indigo-600 text-white"
                        >
                          <Camera size={12} /> Take Shot
                        </Button>
                      </div>

                      {screenshots.length === 0 ? (
                        <div className="p-8 border border-dashed rounded-2xl text-center space-y-2 text-muted-foreground">
                          <Camera className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="font-bold text-xs">No screenshots captured yet.</p>
                          <p className="text-[11px] max-w-xs mx-auto">
                            Click <b>Screenshot</b> or <b>Full Page</b> in the header toolbar to capture visual evidence.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {screenshots.map((shot) => (
                            <div key={shot.id} className="group relative rounded-xl border bg-card overflow-hidden shadow-xs space-y-1">
                              <div className="aspect-video bg-slate-900 relative overflow-hidden cursor-pointer" onClick={() => setPreviewShotUrl(`/api/files/${encodeURIComponent(shot.filePath)}`)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/files/${encodeURIComponent(shot.filePath)}`}
                                  alt="Session Screenshot"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                {shot.fullPage && (
                                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[9px] font-black uppercase">
                                    Full Page
                                  </span>
                                )}
                              </div>
                              <div className="p-2 flex items-center justify-between border-t bg-muted/20">
                                <button
                                  onClick={() => setAnnotatingShot({ kind: "saved", shot })}
                                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
                                >
                                  <Pencil size={11} /> Annotate
                                </button>
                                <a
                                  href={`/api/files/${encodeURIComponent(shot.filePath)}`}
                                  download
                                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground"
                                >
                                  <Download size={11} />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: VIDEO CLIPS */}
                  {rightTab === "videos" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-xs uppercase tracking-wider">Video Evidence Clips</span>
                      </div>

                      {recordings.length === 0 ? (
                        <div className="p-8 border border-dashed rounded-2xl text-center space-y-2 text-muted-foreground">
                          <Video className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="font-bold text-xs">No video clips recorded yet.</p>
                          <p className="text-[11px] max-w-xs mx-auto">
                            Click <b>Record Video</b> in the header toolbar to record live stream clips.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {recordings.map((clip, idx) => (
                            <div key={clip.id || idx} className="p-3 rounded-xl border bg-card space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                  <Video size={14} className="text-indigo-500" /> Video Clip #{idx + 1}
                                </span>
                                {clip.durationMs && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted">
                                    {Math.round(clip.durationMs / 1000)}s
                                  </span>
                                )}
                              </div>

                              {clip.filePath && (
                                <video
                                  controls
                                  src={`/api/files/${encodeURIComponent(clip.filePath)}`}
                                  className="w-full rounded-lg bg-black aspect-video object-contain"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: SMART SELECTORS */}
                  {rightTab === "selectors" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-xs uppercase tracking-wider">Element Selector Repository</span>
                        <Button
                          size="sm"
                          onClick={() => setShowElementDrawer(true)}
                          className="h-7 text-[10px] font-extrabold gap-1 bg-indigo-600 text-white"
                        >
                          <Plus size={12} /> Add Selector
                        </Button>
                      </div>

                      {capturedElements.length === 0 ? (
                        <div className="p-8 border border-dashed rounded-2xl text-center space-y-2 text-muted-foreground">
                          <Layers className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="font-bold text-xs">No element selectors captured yet.</p>
                          <p className="text-[11px] max-w-xs mx-auto">
                            Click <b>Add Selector</b> to inspect and save reusable DOM locators.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {capturedElements.map((el) => (
                            <div key={el.id} className="p-3 rounded-xl border bg-card space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-xs text-foreground">{el.tagName}</span>
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                  {el.type}
                                </span>
                              </div>
                              <p className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 p-1.5 rounded-lg truncate">
                                {el.selector}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: LIVE DIAGNOSTICS LOGS */}
                  {rightTab === "diagnostics" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-xs uppercase tracking-wider">Live Diagnostics Inspector</span>
                        <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[10px] font-bold">
                          <button
                            onClick={() => setDiagnosticTab("console")}
                            className={`px-2 py-1 rounded-md ${diagnosticTab === "console" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
                          >
                            Console ({consoleErrors.length})
                          </button>
                          <button
                            onClick={() => setDiagnosticTab("network")}
                            className={`px-2 py-1 rounded-md ${diagnosticTab === "network" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
                          >
                            Network ({networkErrors.length})
                          </button>
                        </div>
                      </div>

                      {diagnosticTab === "console" && (
                        <div className="space-y-2">
                          {consoleErrors.length === 0 ? (
                            <div className="p-8 border border-dashed rounded-2xl text-center text-muted-foreground font-bold">
                              No console errors logged.
                            </div>
                          ) : (
                            consoleErrors.map((err, idx) => (
                              <div key={idx} className="p-3 rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 font-mono text-[10px] space-y-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <AlertCircle size={12} className="text-rose-600" /> JS Error
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed">{err}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {diagnosticTab === "network" && (
                        <div className="space-y-2">
                          {networkErrors.length === 0 ? (
                            <div className="p-8 border border-dashed rounded-2xl text-center text-muted-foreground font-bold">
                              No network HTTP failures logged.
                            </div>
                          ) : (
                            networkErrors.map((net, idx) => (
                              <div key={idx} className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-mono text-[10px] space-y-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <Globe size={12} className="text-amber-600" /> Network Error
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed">{net}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </aside>
            )}

          </div>

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL OVERLAYS & DRAWERS
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* CREATE BUG MODAL */}
      {showBugDrawer && (
        <CreateBugModal
          projectId={projectId}
          open={showBugDrawer}
          onClose={() => setShowBugDrawer(false)}
          recordingSessionId={sessionId}
          initialValues={{
            title: `[Live QA Defect] ${title}`,
            expectedResult: recordedSteps[recordedSteps.length - 1]?.expectedResult || "Application behaves expectedly",
            actualResult: "Observed functional failure during live testing session",
          }}
          sessionSteps={recordedSteps.map((s) => ({
            stepNumber: s.stepNumber,
            actionDescription: s.actionDescription,
            expectedResult: s.expectedResult,
          }))}
          sessionContext={{
            pageUrl: liveUrl || startUrl,
            consoleLogs: consoleErrors.join("\n"),
            networkErrors: networkErrors.join("\n"),
          }}
          // Everything captured this session is offered in the bug form, with
          // the screenshots pre-selected. Without these two props the modal has
          // no idea the session captured anything.
          attachmentChoices={sessionAttachments}
          initialAttachmentPaths={sessionAttachments.filter((a) => a.kind === "image")}
        />
      )}

      {/* PREVIEW SCREENSHOT MODAL */}
      {previewShotUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-md" onClick={() => setPreviewShotUrl(null)}>
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-black border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewShotUrl(null)} className="absolute top-3 right-3 text-white bg-black/60 p-2 rounded-full hover:bg-black">
              <X size={16} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewShotUrl} alt="Preview Screenshot" className="max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}

      {/* SESSION COMPLETE CELEBRATION MODAL */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md animate-in fade-in duration-200 select-none">
          <div className="w-full max-w-md bg-card border shadow-2xl rounded-3xl p-6 text-center space-y-6 animate-in zoom-in duration-200">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center dark:bg-emerald-950/60 dark:text-emerald-400">
              <FileCheck size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-foreground">Live QA session completed</h2>
              <p className="text-xs text-muted-foreground font-normal">
                {completionSummary?.testCases.length
                  ? `The recorded scenario was saved as ${completionSummary.testCases.length === 1 ? "a test case" : `${completionSummary.testCases.length} test cases`} in your library.`
                  : "No scenario steps were recorded, so no test case was created. Your screenshots, videos and bugs are kept in the session report."}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-muted/40 border text-xs">
              <div className="space-y-0.5">
                <span className="font-black text-lg text-indigo-600">{completionSummary?.steps ?? 0}</span>
                <span className="block text-[10px] font-bold text-muted-foreground uppercase">Steps</span>
              </div>
              <div className="space-y-0.5">
                <span className="font-black text-lg text-emerald-600">{completionSummary?.shots ?? 0}</span>
                <span className="block text-[10px] font-bold text-muted-foreground uppercase">Shots</span>
              </div>
              <div className="space-y-0.5">
                <span className="font-black text-lg text-purple-600">{completionSummary?.videos ?? 0}</span>
                <span className="block text-[10px] font-bold text-muted-foreground uppercase">Videos</span>
              </div>
            </div>
            {!!completionSummary && completionSummary.consoleErrors + completionSummary.networkErrors > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                The app logged {completionSummary.consoleErrors} console error(s) and {completionSummary.networkErrors} failed request(s) during the session.
              </p>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {completionSummary?.sessionId && (
                <Button
                  onClick={() => router.push(`/projects/${projectId}/live-qa-history?session=${completionSummary.sessionId}`)}
                  className="w-full h-10 font-extrabold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                >
                  Open session report
                </Button>
              )}
              {completionSummary?.testCases.length === 1 && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/projects/${projectId}/test-cases/${completionSummary.testCases[0].id}`)}
                  className="w-full h-10 font-bold text-xs rounded-xl"
                >
                  Open the test case
                </Button>
              )}
              {(completionSummary?.testCases.length ?? 0) > 1 && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/projects/${projectId}/test-cases`)}
                  className="w-full h-10 font-bold text-xs rounded-xl"
                >
                  View in Test Case Library
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowCompletionModal(false)}
                className="w-full h-10 font-bold text-xs rounded-xl"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: MANUAL STEP FORM */}
      {showManualStepDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-[450px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b flex items-center justify-between bg-muted/30">
              <h3 className="font-bold text-base flex items-center gap-1.5">
                <Plus className="h-5 w-5 text-indigo-500" /> Append Test Step
              </h3>
              <button onClick={() => setShowManualStepDrawer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualStep} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs font-semibold">
              <div className="space-y-1.5">
                <Label htmlFor="man-desc">Action Description *</Label>
                <Input id="man-desc" value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} required placeholder="e.g. Click submit button and verify dashboard navigation" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="man-atype">Action Type</Label>
                  <select id="man-atype" value={manualActionType} onChange={(e) => setManualActionType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="click">click</option>
                    <option value="fill">fill / type</option>
                    <option value="open_url">open_url</option>
                    <option value="select">select option</option>
                    <option value="assert_visible">assert / verify</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="man-ttype">Target Element Type</Label>
                  <select id="man-ttype" value={manualTargetType} onChange={(e) => setManualTargetType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="role">button</option>
                    <option value="label">input / field</option>
                    <option value="css">css selector</option>
                    <option value="xpath">xpath query</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="man-tval">Target Selector Value</Label>
                <Input id="man-tval" value={manualTargetValue} onChange={(e) => setManualTargetValue(e.target.value)} placeholder="e.g. #submit-btn or [data-testid='login']" />
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
                <Button type="submit" className="bg-indigo-600 text-white">Append Step</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER: SMART ELEMENT CAPTURE ANALYZER */}
      {showElementDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-[450px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b flex items-center justify-between bg-muted/30">
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

      {/* Screenshot Annotation Editor */}
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
                <Camera size={14} className="text-indigo-600" /> Upload File to Browser
              </h3>
              <button
                onClick={handleCancelFileChooser}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                The web page in the remote browser requested a file upload. Choose a local file to forward to it:
              </p>

              <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-2xl p-6 transition-all bg-slate-50/50 hover:bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer relative">
                <Input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                {uploadingFile ? (
                  <>
                    <Loader2 size={24} className="text-indigo-600 animate-spin" />
                    <span className="text-[10px] font-black text-indigo-700 uppercase">Uploading file...</span>
                  </>
                ) : (
                  <>
                    <div className="p-2.5 rounded-2xl bg-white border shadow-xs text-slate-400">
                      <Camera size={20} />
                    </div>
                    <span className="text-[10.5px] font-black text-slate-800 uppercase tracking-wide">Select Local File</span>
                    <span className="text-[9px] font-bold text-slate-400">Drag and drop or click here</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={handleCancelFileChooser}
                disabled={uploadingFile}
                className="flex-1 rounded-xl h-9 text-xs font-black border-slate-200 text-slate-600 bg-white"
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
