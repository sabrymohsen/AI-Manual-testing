"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import Editor from "@monaco-editor/react"
import { generatePlaywrightSpec, RecordedAction } from "@/lib/recorder-codegen"
import {
  Play,
  Square,
  Save,
  Copy,
  Download,
  Loader2,
  X,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  MousePointerClick,
  Keyboard,
  Navigation,
  ListChecks,
  Camera,
  RefreshCw,
  Maximize2,
  Minimize2,
  Plus,
  RotateCw
} from "lucide-react"

type Phase = "idle" | "starting" | "recording" | "review"

interface VisualRecorderSectionProps {
  onSavedToStudio?: (scriptName: string) => void
  /** Saved recordings belong to this project's test list. */
  projectId?: string
}

export interface DeviceOption {
  name: string
  label: string
  width: number
  height: number
  scaleFactor: number
  userAgent: string
  os: string
  isMobile: boolean
  icon: "desktop" | "phone" | "tablet"
  isCustom?: boolean
}

export const STANDARD_DEVICES: DeviceOption[] = [
  {
    name: "iPhone 14",
    label: "iPhone 14",
    width: 393,
    height: 852,
    scaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    os: "iOS 16",
    isMobile: true,
    icon: "phone"
  },
  {
    name: "iPhone 15",
    label: "iPhone 15",
    width: 393,
    height: 852,
    scaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    os: "iOS 17",
    isMobile: true,
    icon: "phone"
  },
  {
    name: "Pixel 7",
    label: "Pixel 7",
    width: 412,
    height: 915,
    scaleFactor: 2.6,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36",
    os: "Android 13",
    isMobile: true,
    icon: "phone"
  },
  {
    name: "Pixel 8",
    label: "Pixel 8",
    width: 412,
    height: 892,
    scaleFactor: 2.6,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
    os: "Android 14",
    isMobile: true,
    icon: "phone"
  },
  {
    name: "iPad Pro",
    label: "iPad Pro",
    width: 1024,
    height: 1366,
    scaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    os: "iPadOS 17",
    isMobile: true,
    icon: "tablet"
  },
  {
    name: "iPad Air",
    label: "iPad Air",
    width: 820,
    height: 1180,
    scaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    os: "iPadOS 16",
    isMobile: true,
    icon: "tablet"
  },
  {
    name: "Samsung Galaxy S24",
    label: "Samsung S24",
    width: 360,
    height: 780,
    scaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-G921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    os: "Android 14",
    isMobile: true,
    icon: "phone"
  },
  {
    name: "Desktop",
    label: "Desktop HD",
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    os: "macOS",
    isMobile: false,
    icon: "desktop"
  }
]

const BROWSERS = ["Chrome", "Firefox", "Edge"]

const ACTION_ICONS: Record<string, any> = {
  navigate: Navigation,
  click: MousePointerClick,
  type: Keyboard,
  select: ListChecks,
  press: Keyboard
}

export default function VisualRecorderSection({ onSavedToStudio, projectId }: VisualRecorderSectionProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [url, setUrl] = useState("https://example.com")
  const [browser, setBrowser] = useState("Chrome")
  const [startError, setStartError] = useState("")
  const [isFullScreen, setIsFullScreen] = useState(false)

  // Emulation picker gallery states
  const [selectedDevice, setSelectedDevice] = useState<DeviceOption>(STANDARD_DEVICES[7]) // default Desktop
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait")
  const [customDevices, setCustomDevices] = useState<DeviceOption[]>([])
  
  // Custom Device Dialog Modal state
  const [customDeviceModalOpen, setCustomDeviceModalOpen] = useState(false)
  const [customName, setCustomName] = useState("")
  const [customWidth, setCustomWidth] = useState(375)
  const [customHeight, setCustomHeight] = useState(812)
  const [customScale, setCustomScale] = useState(3)
  const [customUserAgent, setCustomUserAgent] = useState("Mozilla/5.0 (Custom Device)")

  // Load custom devices from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("hub_custom_devices")
      if (stored) {
        setCustomDevices(JSON.parse(stored))
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const allDevices = useMemo(() => {
    return [...STANDARD_DEVICES, ...customDevices]
  }, [customDevices])

  // orientation dimension swap
  const activeViewport = useMemo(() => {
    if (selectedDevice.isMobile && orientation === "landscape") {
      return { width: selectedDevice.height, height: selectedDevice.width }
    }
    return { width: selectedDevice.width, height: selectedDevice.height }
  }, [selectedDevice, orientation])

  // Live session state
  const [frame, setFrame] = useState<string | null>(null)
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 })
  const [currentUrl, setCurrentUrl] = useState("")
  const [actions, setActions] = useState<RecordedAction[]>([])
  const [now, setNow] = useState(Date.now())

  // Review state
  const [code, setCode] = useState("")
  const [codeEdited, setCodeEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState("")

  // Save-to-Studio modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveError, setSaveError] = useState("")

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const wheelBudget = useRef(0)
  const phaseRef = useRef<Phase>("idle")
  phaseRef.current = phase

  // ---------- Polling ----------

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/recorder/status")
      if (!res.ok) return
      const d = await res.json()
      if (phaseRef.current !== "recording") return
      if (d.frame) setFrame(d.frame)
      if (d.viewport) setViewport(d.viewport)
      if (d.currentUrl) setCurrentUrl(d.currentUrl)
      setActions(d.actions || [])
      setNow(Date.now())
      if (!d.recording) {
        // session ended server-side (e.g. browser crashed)
        setPhase("review")
      }
    } catch {
      // transient poll failure — keep going
    }
  }, [])

  useEffect(() => {
    if (phase === "recording") {
      pollRef.current = setInterval(pollStatus, 900)
      return () => {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
  }, [phase, pollStatus])

  // Stop the backend session if the user navigates away mid-recording
  useEffect(() => {
    return () => {
      if (phaseRef.current === "recording") {
        fetch("/api/hub/recorder/stop", { method: "POST" }).catch(() => {})
      }
    }
  }, [])

  // Live code preview generated from captured actions (until the user edits manually)
  useEffect(() => {
    if (!codeEdited) setCode(generatePlaywrightSpec(actions))
  }, [actions, codeEdited])

  // ---------- Session controls ----------

  const handleStart = async () => {
    setStartError("")
    setPhase("starting")
    setActions([])
    setFrame(null)
    setCode(generatePlaywrightSpec([]))
    setCodeEdited(false)
    setSavedName("")
    try {
      const res = await fetch("/api/hub/recorder/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          device: selectedDevice.name,
          browser,
          customViewport: activeViewport,
          customUserAgent: selectedDevice.userAgent,
          customScaleFactor: selectedDevice.scaleFactor,
          isMobile: selectedDevice.isMobile
        })
      })
      const d = await res.json()
      if (!res.ok) {
        setStartError(d.error || "Failed to start the capture session")
        setPhase("idle")
        return
      }
      setViewport(d.viewport)
      setCurrentUrl(url)
      setPhase("recording")
    } catch (err: any) {
      setStartError(err.message)
      setPhase("idle")
    }
  }

  const handleStop = async () => {
    try {
      const res = await fetch("/api/hub/recorder/stop", { method: "POST" })
      if (res.ok) {
        const d = await res.json()
        setActions(d.actions || [])
      }
    } catch {}
    setPhase("review")
  }

  const handleDiscard = () => {
    setPhase("idle")
    setActions([])
    setFrame(null)
    setCode("")
    setCodeEdited(false)
    setSavedName("")
  }

  // ---------- Input forwarding (streamed view → real browser) ----------

  const sendInput = (payload: Record<string, unknown>) => {
    fetch("/api/hub/recorder/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {})
  }

  const handleViewClick = (e: React.MouseEvent) => {
    if (phase !== "recording" || !imgRef.current) return
    viewRef.current?.focus()
    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * viewport.width
    const y = ((e.clientY - rect.top) / rect.height) * viewport.height
    sendInput({ type: "click", x, y })
    // refresh quickly so the click's effect shows up
    setTimeout(pollStatus, 350)
  }

  const handleViewKeyDown = (e: React.KeyboardEvent) => {
    if (phase !== "recording") return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key.length === 1 || ["Enter", "Backspace", "Delete", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault()
      sendInput({ type: "key", key: e.key })
      if (e.key === "Enter") setTimeout(pollStatus, 500)
    }
  }

  const handleViewWheel = (e: React.WheelEvent) => {
    if (phase !== "recording") return
    wheelBudget.current += e.deltaY
    if (Math.abs(wheelBudget.current) > 60) {
      sendInput({ type: "scroll", deltaY: wheelBudget.current })
      wheelBudget.current = 0
      setTimeout(pollStatus, 350)
    }
  }

  // ---------- Review actions ----------

  const handleDeleteAction = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id).map((a, i) => ({ ...a, step: i + 1 })))
    // deleting a step regenerates the code from the remaining actions
    setCodeEdited(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
  }

  // The test's title, from `test("…"` in the code: a readable default name.
  const titleFromCode = () => code.match(/\btest\(\s*["'`]([^"'`]+)["'`]/)?.[1]?.trim() || ""

  const handleDownload = () => {
    const base = (saveName || titleFromCode() || "recorded-flow").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    const blob = new Blob([code], { type: "text/javascript" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${base || "recorded-flow"}.spec.js`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleSaveToStudio = () => {
    const fromTitle = titleFromCode()
    const suggested =
      fromTitle && fromTitle !== "Recorded Flow Test"
        ? fromTitle.slice(0, 80)
        : `Recorded flow ${new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-")}`
    setSaveName(suggested)
    setSaveError("")
    setSaveModalOpen(true)
  }

  const handleConfirmSave = async () => {
    const name = saveName.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(name)) {
      setSaveError("Use letters, numbers, spaces, - or _ (up to 80 characters).")
      return
    }

    setSaving(true)
    setSaveError("")
    try {
      // Keep the test's title in step with the chosen name.
      const finalCode = code.replace(/\btest\(\s*"[^"]*"/, `test(${JSON.stringify(name)}`)
      const res = await fetch("/api/hub/recorder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code: finalCode, tags: ["recorded"], projectId, folder: "Recorded" })
      })
      const d = await res.json()
      if (!res.ok) {
        setSaveError(d.error || "Couldn't save the test")
        return
      }
      setSaveModalOpen(false)
      setSavedName(name)
      onSavedToStudio?.(name)
    } catch (err: any) {
      setSaveError(err.message || "Couldn't save the test")
    } finally {
      setSaving(false)
    }
  }

  const handleAddCustomDevice = () => {
    if (!customName.trim()) return
    const newDev: DeviceOption = {
      name: customName.trim(),
      label: customName.trim(),
      width: Number(customWidth) || 375,
      height: Number(customHeight) || 812,
      scaleFactor: Number(customScale) || 1,
      userAgent: customUserAgent.trim(),
      os: "Custom",
      isMobile: true,
      icon: "phone",
      isCustom: true
    }
    const updated = [...customDevices, newDev]
    setCustomDevices(updated)
    localStorage.setItem("hub_custom_devices", JSON.stringify(updated))
    setSelectedDevice(newDev)
    setCustomDeviceModalOpen(false)
    setCustomName("")
  }

  // ---------- Derived ----------

  // Red highlight box for the most recent captured element interaction
  const highlight = (() => {
    if (phase !== "recording") return null
    const last = [...actions].reverse().find((a) => a.rect)
    if (!last?.rect || now - last.at > 4000) return null
    return last.rect
  })()

  const DeviceIcon = selectedDevice.icon === "desktop" ? Monitor : selectedDevice.icon === "tablet" ? Tablet : Smartphone

  return (
    <div className="space-y-4">
      {/* RECORDER TOOLBAR */}
      <div className="bg-white border rounded-2xl p-3 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <Globe size={14} className="text-slate-400 shrink-0" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={phase === "recording" || phase === "starting"}
            placeholder="https://your-app.com/login"
            className="flex-1 h-9 rounded-xl border px-3 text-xs bg-slate-50 font-semibold disabled:opacity-60"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Read-only Device view details badge */}
          <div className="flex items-center gap-1.5 px-3 h-9 bg-slate-50 border rounded-xl text-[10px] font-black text-slate-650 uppercase">
            <DeviceIcon size={12} className="text-indigo-650" />
            <span>{selectedDevice.label} ({activeViewport.width}×{activeViewport.height})</span>
          </div>

          <select
            value={browser}
            onChange={(e) => setBrowser(e.target.value)}
            disabled={phase === "recording" || phase === "starting"}
            className="h-9 rounded-xl border px-2.5 text-[10px] bg-slate-50 font-bold cursor-pointer disabled:opacity-60"
          >
            {BROWSERS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          {phase === "idle" || phase === "starting" ? (
            <Button
              onClick={handleStart}
              disabled={phase === "starting"}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-9 px-4 text-xs font-black shadow-sm flex items-center gap-1.5"
            >
              {phase === "starting" ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              {phase === "starting" ? "Launching..." : "Start Recording"}
            </Button>
          ) : phase === "recording" ? (
            <Button
              onClick={handleStop}
              className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl h-9 px-4 text-xs font-black shadow-sm flex items-center gap-1.5"
            >
              <Square size={11} className="fill-current" /> Stop
            </Button>
          ) : (
            <Button
              onClick={handleDiscard}
              variant="outline"
              className="rounded-xl h-9 px-3.5 text-xs font-black border-slate-200 text-slate-650 bg-white flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> New Recording
            </Button>
          )}
        </div>
      </div>

      {/* DEVICE EMULATION GALLERY & CUSTOM DEVICE ACTIONS */}
      {(phase === "idle" || phase === "starting") && (
        <div className="bg-white border rounded-2xl p-5 shadow-xs space-y-5 text-left">
          <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-3 select-none">
            <div className="space-y-1">
              <h3 className="text-xs font-black text-slate-800 leading-tight uppercase tracking-wider">Device Emulation Gallery</h3>
              <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Select viewport configuration preset for live action recording</p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Orientation toggle segments */}
              {selectedDevice.isMobile && (
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 border rounded-xl">
                  <button
                    onClick={() => setOrientation("portrait")}
                    className={`px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all ${
                      orientation === "portrait"
                        ? "bg-white text-indigo-700 shadow-3xs border"
                        : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    Portrait
                  </button>
                  <button
                    onClick={() => setOrientation("landscape")}
                    className={`px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all ${
                      orientation === "landscape"
                        ? "bg-white text-indigo-700 shadow-3xs border"
                        : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    Landscape
                  </button>
                </div>
              )}

              <Button
                onClick={() => setCustomDeviceModalOpen(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl h-8.5 px-3.5 font-black text-[10px] flex items-center gap-1 shadow-xs"
              >
                <Plus size={11} /> Add Custom Device
              </Button>
            </div>
          </div>

          {/* Grid list of devices cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
            {allDevices.map((dev) => {
              const DevIcon = dev.icon === "desktop" ? Monitor : dev.icon === "tablet" ? Tablet : Smartphone
              const isSelected = selectedDevice.name === dev.name
              // Show resolved viewport dimensions based on current orientation logic
              const w = dev.isMobile && orientation === "landscape" ? dev.height : dev.width
              const h = dev.isMobile && orientation === "landscape" ? dev.width : dev.height
              
              return (
                <div
                  key={dev.name}
                  onClick={() => setSelectedDevice(dev)}
                  className={`border rounded-2xl p-3.5 flex flex-col gap-2 cursor-pointer transition-all ${
                    isSelected
                      ? "bg-indigo-50/40 border-indigo-500 shadow-xs ring-1 ring-indigo-500"
                      : "bg-slate-50/50 border-slate-200 hover:border-slate-350 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 rounded-xl border ${
                      isSelected ? "bg-white border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-500"
                    }`}>
                      <DevIcon size={14} className={isSelected && dev.isMobile && orientation === "landscape" ? "rotate-90 transition-transform" : "transition-transform"} />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">
                      {dev.isCustom ? "Custom" : dev.os}
                    </span>
                  </div>

                  <div>
                    <span className="font-extrabold text-[11.5px] text-slate-800 block truncate">{dev.label}</span>
                    <span className="text-[10px] font-bold text-slate-500 font-mono mt-0.5 block">
                      {w} × {h} px
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 font-mono pt-1.5 border-t">
                    <span>Scale: {dev.scaleFactor}x</span>
                    <span>{dev.isMobile ? "Mobile" : "Desktop"}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Viewport Live Preview parameters panel */}
          <div className="bg-slate-50 border p-3 rounded-2xl flex items-center justify-between flex-wrap gap-4 text-[10px] font-bold text-slate-500 select-none">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Viewport Size:</span>
              <span className="text-slate-800 font-mono">
                {activeViewport.width} × {activeViewport.height} px
                {selectedDevice.isMobile ? ` (${orientation === "portrait" ? "Portrait" : "Landscape"})` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Device Scale Factor:</span>
              <span className="text-slate-800 font-mono">{selectedDevice.scaleFactor}x</span>
            </div>
            <div className="flex items-center gap-1.5 max-w-[400px] truncate">
              <span className="text-slate-400 shrink-0">User Agent:</span>
              <span className="text-slate-700 font-mono text-[9px]" title={selectedDevice.userAgent}>
                {selectedDevice.userAgent}
              </span>
            </div>
          </div>
        </div>
      )}

      {startError && (
        <p className="text-rose-600 text-[10px] font-bold bg-rose-50 border border-rose-100 rounded-xl p-3">{startError}</p>
      )}

      {/* TWO-PANEL LAYOUT: browser 60% | code + actions 40% */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* LEFT: BROWSER VIEW */}
        <div className={isFullScreen ? "fixed inset-0 z-[9999] bg-white flex flex-col h-screen w-screen p-4 animate-in fade-in" : "lg:col-span-3 bg-white border rounded-2xl shadow-sm overflow-hidden"}>
          <div className="bg-slate-50 border-b p-2.5 flex items-center justify-between gap-2">
            <div className="flex gap-1.5 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400 block" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 block" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 block" />
            </div>
            <span className="font-mono text-[9.5px] text-slate-500 truncate flex-1 text-center">
              {currentUrl || "Recorder browser"}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {phase === "recording" && (
                <span className="flex items-center gap-1.5 text-rose-600 font-black text-[9px] uppercase">
                  <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" /> REC
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-650"
              >
                {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </Button>
            </div>
          </div>

          <div
            ref={viewRef}
            tabIndex={0}
            onClick={handleViewClick}
            onKeyDown={handleViewKeyDown}
            onWheel={handleViewWheel}
            className={`relative bg-slate-100 outline-none flex items-center justify-center min-h-[420px] ${
              isFullScreen ? "flex-1 h-[calc(100vh-100px)] w-full overflow-y-auto py-4 bg-slate-950" : ""
            } ${
              phase === "recording" ? "cursor-crosshair focus:ring-2 focus:ring-rose-300 ring-inset" : ""
            }`}
          >
            {frame ? (
              <div
                className="relative mx-auto border rounded-xl shadow-2xl overflow-hidden bg-white"
                style={{
                  maxWidth: isFullScreen ? "100%" : viewport.width,
                  aspectRatio: `${viewport.width} / ${viewport.height}`,
                  width: "100%"
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={frame} alt="Live browser view" className="w-full block select-none" draggable={false} />
                {highlight && imgRef.current && (
                  <div
                    className="absolute border-2 border-rose-500 bg-rose-400/10 rounded pointer-events-none transition-all duration-150"
                    style={{
                      left: `${(highlight.x / viewport.width) * 100}%`,
                      top: `${(highlight.y / viewport.height) * 100}%`,
                      width: `${(highlight.width / viewport.width) * 100}%`,
                      height: `${(highlight.height / viewport.height) * 100}%`
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-24 space-y-2 px-6">
                {phase === "starting" ? (
                  <>
                    <Loader2 size={22} className="animate-spin text-rose-500 mx-auto" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Launching recorder browser...</p>
                  </>
                ) : (
                  <>
                    <Camera size={26} className="text-slate-300 mx-auto" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Enter a URL and press Start Recording
                    </p>
                    <p className="text-[9.5px] text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
                      The page streams here live. Click, type, and scroll directly on the view — every interaction is
                      captured with a Smart Locator and turned into Playwright code in real time.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {phase === "recording" && (
            <div className="bg-slate-50 border-t p-2 text-center text-[9px] font-bold text-slate-400">
              Click to interact · type on your keyboard to fill focused fields · scroll with the mouse wheel · passwords are auto-masked
            </div>
          )}
        </div>

        {/* RIGHT: ACTIONS + CODE */}
        <div className="lg:col-span-2 space-y-4">
          {/* Action log */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Recorded Actions</span>
              <span className="text-[8.5px] font-black bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{actions.length} steps</span>
            </div>
            <div className="max-h-[230px] overflow-y-auto divide-y">
              {actions.map((a) => {
                const Icon = ACTION_ICONS[a.kind] || MousePointerClick
                return (
                  <div key={a.id} className="p-2.5 flex items-start gap-2 hover:bg-slate-50/70 group">
                    <span className="h-5 w-5 rounded-full bg-slate-100 text-slate-500 text-[8.5px] font-black flex items-center justify-center shrink-0 mt-0.5">
                      {a.step}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Icon size={11} className="text-indigo-600 shrink-0" />
                        <span className="text-[9px] font-black uppercase text-slate-600">{a.kind}</span>
                        <span className="text-[9.5px] font-bold text-slate-800 truncate">{a.label}</span>
                      </div>
                      {a.locator && (
                        <code className="font-mono text-[8.5px] text-indigo-700 block truncate mt-0.5">{a.locator}</code>
                      )}
                      {a.kind === "type" && (
                        <span className={`text-[8.5px] font-mono block truncate ${a.isPassword ? "text-rose-500 font-black" : "text-slate-400"}`}>
                          “{a.isPassword ? "[REDACTED]" : a.value}”
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAction(a.id)}
                      title="Remove this step"
                      className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
              {actions.length === 0 && (
                <p className="text-slate-400 italic text-[10px] text-center py-8 px-4">
                  No actions captured yet. Interactions with the browser view will appear here numbered, with their Smart Locators.
                </p>
              )}
            </div>
          </div>

          {/* Code preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
            <div className="bg-slate-950 px-3 py-2.5 flex items-center justify-between border-b border-slate-800">
              <span className="font-mono font-bold text-[9.5px] text-slate-300 uppercase tracking-wider">
                Generated Playwright TypeScript {phase === "recording" ? "(live)" : phase === "review" ? "(editable)" : ""}
              </span>
              {codeEdited && <span className="text-[8px] font-black text-amber-400 uppercase">edited</span>}
            </div>
            <Editor
              height="300px"
              defaultLanguage="java"
              theme="vs-dark"
              value={code}
              onChange={(v) => {
                if (phase === "review") {
                  setCode(v || "")
                  setCodeEdited(true)
                }
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 10.5,
                lineHeight: 17,
                readOnly: phase !== "review",
                scrollBeyondLastLine: false,
                automaticLayout: true
              }}
            />
            {phase === "review" && (
              <div className="bg-slate-950 border-t border-slate-800 p-2.5 grid grid-cols-3 gap-2">
                <Button
                  onClick={handleSaveToStudio}
                  disabled={saving || actions.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-8 text-[9.5px] font-black flex items-center gap-1 justify-center"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save to Studio
                </Button>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="rounded-xl h-8 text-[9.5px] font-black border-slate-700 text-slate-300 bg-slate-900 hover:bg-slate-800 hover:text-white flex items-center gap-1 justify-center"
                >
                  <Copy size={11} /> Copy
                </Button>
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="rounded-xl h-8 text-[9.5px] font-black border-slate-700 text-slate-300 bg-slate-900 hover:bg-slate-800 hover:text-white flex items-center gap-1 justify-center"
                >
                  <Download size={11} /> .java
                </Button>
              </div>
            )}
          </div>

          {savedName && (
            <p className="text-emerald-700 text-[10px] font-black bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-1.5">
              <Play size={11} /> Saved as “{savedName}” in the Recorded folder — open the Tests tab to run it.
            </p>
          )}
        </div>
      </div>

      {/* SAVE-TO-STUDIO CONFIRMATION MODAL */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-md p-5 space-y-4 text-left">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Save size={14} className="text-indigo-600" /> Save as a test
              </h3>
              <button
                onClick={() => setSaveModalOpen(false)}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 block uppercase">Test name</label>
              <input
                value={saveName}
                onChange={(e) => {
                  setSaveName(e.target.value)
                  setSaveError("")
                }}
                onKeyDown={(e) => e.key === "Enter" && !saving && handleConfirmSave()}
                autoFocus
                disabled={saving}
                placeholder="Login with valid user"
                className="w-full h-10 rounded-xl border px-3 text-xs bg-slate-50 font-mono font-bold disabled:opacity-60"
              />
              <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                Saved as Playwright JavaScript in this project's “Recorded” folder. The test's title in the code
                is renamed to match.
              </p>
              {code.includes("process.env.RECORDED_PASSWORD") && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
                  The password you typed is not saved in the test. Before running it, add a secret named{" "}
                  <span className="font-mono font-bold">RECORDED_PASSWORD</span> under More tools → Data &amp; settings →
                  Secrets.
                </p>
              )}
            </div>

            {saveError && (
              <p className="text-rose-600 text-[10px] font-bold bg-rose-50 border border-rose-100 rounded-xl p-2.5">
                {saveError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setSaveModalOpen(false)}
                disabled={saving}
                className="flex-1 rounded-xl h-9 text-xs font-black border-slate-200 text-slate-600 bg-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSave}
                disabled={saving || !saveName.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-9 text-xs font-black flex items-center gap-1.5 justify-center"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Script
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DEVICE EMULATION MODAL */}
      {customDeviceModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-sm p-6 space-y-4 text-left animate-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b pb-2.5 select-none">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Plus size={14} className="text-indigo-650" /> Create Custom Device
              </h3>
              <button
                onClick={() => setCustomDeviceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase block">Device Name / Label</label>
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Galaxy Fold"
                  className="w-full h-9.5 rounded-xl border px-3 text-xs bg-slate-50 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase block">Width (px)</label>
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value) || 375)}
                    className="w-full h-9.5 rounded-xl border px-3 text-xs bg-slate-50 font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase block">Height (px)</label>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value) || 812)}
                    className="w-full h-9.5 rounded-xl border px-3 text-xs bg-slate-50 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase block">Device Scale Factor</label>
                <input
                  type="number"
                  step="0.1"
                  value={customScale}
                  onChange={(e) => setCustomScale(Number(e.target.value) || 1)}
                  className="w-full h-9.5 rounded-xl border px-3 text-xs bg-slate-50 font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase block">User Agent Override</label>
                <textarea
                  value={customUserAgent}
                  onChange={(e) => setCustomUserAgent(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border p-2.5 text-xs bg-slate-50 font-mono text-[9px] font-bold leading-relaxed resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t select-none">
              <Button
                variant="outline"
                onClick={() => setCustomDeviceModalOpen(false)}
                className="flex-1 rounded-xl h-9 text-xs font-black border-slate-200 text-slate-650 bg-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddCustomDevice}
                disabled={!customName.trim()}
                className="flex-1 bg-indigo-650 text-white hover:bg-indigo-700 rounded-xl h-9 text-xs font-black"
              >
                Add Preset
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
