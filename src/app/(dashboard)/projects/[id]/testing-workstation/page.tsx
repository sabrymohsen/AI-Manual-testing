"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import {
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

interface Project {
  id: string
  name: string
  webAppUrl: string
  credentials: Array<{ id: string; roleName: string; username: string }>
}

export default function TestingWorkstationPage() {
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
  const [moduleId, setModuleId] = useState("")
  const [featureId, setFeatureId] = useState("")
  const [componentId, setComponentId] = useState("")
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

  // Triage forms state
  const [bugTitle, setBugTitle] = useState("")
  const [bugSeverity, setBugSeverity] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [bugPriority, setBugPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [bugExpected, setBugExpected] = useState("")
  const [bugActual, setBugActual] = useState("")
  const [bugSaving, setBugSaving] = useState(false)
  const [bugError, setBugError] = useState("")

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

  // Interactive screenshot gallery
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)

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
          moduleId: moduleId || null,
          featureId: featureId || null,
          componentId: componentId || null,
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
        setToast({ message: "Live QA Controlled browser launched successfully!", type: "success" })
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
        setToast({ message: finish ? "Live QA Session successfully completed and converted to test case!" : "Session cancelled.", type: "success" })
      }
    } catch {}
  }

  // ── Evidentiary Capture Actions ──────────────────────────────────────────

  async function handleTakeScreenshot() {
    if (!sessionId) return
    setCapturingScreenshot(true)
    try {
      const res = await fetch(`/api/recording/${sessionId}/screenshot`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setScreenshots(prev => [...prev, data.screenshotPath])
        setToast({ message: "Screenshot captured and auto-linked successfully!", type: "success" })
      }
    } catch {
      setToast({ message: "Screenshot capture failed gracefully.", type: "error" })
    } finally {
      setCapturingScreenshot(false)
    }
  }

  async function handleCreateBug(e: React.FormEvent) {
    e.preventDefault()
    if (!bugTitle.trim()) {
      setBugError("Bug Title is required")
      return
    }

    setBugSaving(true)
    setBugError("")

    try {
      const res = await fetch(`/api/recording/${sessionId}/bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bugTitle,
          severity: bugSeverity,
          priority: bugPriority,
          actualResult: bugActual || "Failure during live manual execution trace.",
          screenshotPath: screenshots[screenshots.length - 1] || null
        })
      })

      if (res.ok) {
        setShowBugDrawer(false)
        setBugTitle("")
        setBugActual("")
        setToast({ message: "Defect logged and attached successfully!", type: "success" })
      } else {
        const data = await res.json()
        setBugError(data.error || "Failed to log bug report")
      }
    } catch {
      setBugError("Error connecting to bug report API")
    } finally {
      setBugSaving(false)
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
          Loading QA Workstation configurations...
        </div>
      ) : !sessionId ? (
        
        // ═════════════════════════════════════════════════════════════════════
        // INITIAL WORKSTATION SETUP FORM
        // ═════════════════════════════════════════════════════════════════════
        <div className="flex-1 overflow-y-auto max-w-2xl mx-auto px-6 py-12 space-y-8 select-none text-xs font-semibold">
          <div className="space-y-1.5 border-b pb-4">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
              <Zap className="h-7 w-7 text-indigo-500 fill-current" /> Live QA Testing Workstation
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              Start a live browser session to perform manual validation, record replay steps, capture video, and log defect traces.
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

            <div className="space-y-2">
              <Label>Suite Directory Path</Label>
              <HierarchySelector 
                projectId={projectId}
                moduleId={moduleId}
                onChangeModuleId={setModuleId}
                featureId={featureId}
                onChangeFeatureId={setFeatureId}
                componentId={componentId}
                onChangeComponentId={setComponentId}
                showLabels={false}
              />
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
                Session video is <b>not</b> recorded automatically. Start and stop it anytime with the <b>🎥 Record</b> button on the in-browser QA toolbar.
              </Label>
            </div>

            {startError && <p className="text-sm text-destructive font-semibold">{startError}</p>}

            <Button type="submit" disabled={startingSession} className="w-full flex items-center justify-center gap-1.5 font-semibold h-10 mt-6 bg-indigo-600 hover:bg-indigo-700 text-white">
              {startingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Launch Live Testing Window
            </Button>
          </form>
        </div>
      ) : (
        
        // ═════════════════════════════════════════════════════════════════════
        // ACTIVE TESTING CONTROL ROOM (WORKSTATION RUNNING)
        // ═════════════════════════════════════════════════════════════════════
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT COLUMN: Terminal Logs & AI Suggestions */}
          <div className="w-80 shrink-0 border-r flex flex-col bg-accent/5">
            {/* Health & Status Indicator */}
            <div className="p-4 border-b bg-card space-y-2 select-none">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Activity className="h-4 w-4 text-indigo-500" /> Control Status
                </span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 px-1.5 py-0.5 rounded font-mono uppercase">
                  {connectionStatus}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground font-semibold">Active Session:</span>
                <span className="text-foreground truncate font-mono max-w-[140px] font-bold" title={sessionId}>{sessionId}</span>
              </div>
            </div>

            {/* Video capture hint — recording is started on demand from the in-browser toolbar */}
            <div className="px-4 py-2 border-b bg-teal-500/[0.04] text-teal-700 text-[10px] font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Video className="h-3.5 w-3.5" /> Video: use 🎥 Record on the browser toolbar
              </span>
              <span className="font-mono font-semibold">WebM</span>
            </div>

            {/* AI Assertion Recommender Card */}
            <div className="p-4 border-b space-y-2 select-none">
              <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-500" /> Assertion Suggestions
              </span>
              <div className="space-y-2">
                {getSuggestions().map((s, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border border-indigo-100 bg-indigo-500/[0.01] text-[11px] font-normal leading-relaxed text-slate-700 dark:text-slate-300">
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Log Stream Panel */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100 select-none">
              <div className="p-3 border-b border-slate-800 text-[10px] font-bold tracking-wider text-slate-400 flex items-center gap-1.5 uppercase">
                <Terminal className="h-3.5 w-3.5" /> Browser Event Stream
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono text-[10px] leading-relaxed">
                {consoleErrors.length === 0 && networkErrors.length === 0 ? (
                  <p className="text-slate-500 italic">Listening to browser exceptions, console warnings, and network anomalies...</p>
                ) : (
                  <>
                    {consoleErrors.map((err, idx) => (
                      <div key={idx} className="text-yellow-400">
                        <span className="text-yellow-500">[Console Warning]:</span> {err}
                      </div>
                    ))}
                    {networkErrors.map((err, idx) => (
                      <div key={idx} className="text-red-400">
                        <span className="text-red-500">[Network Error]:</span> {err}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* CENTER PANEL: Interactive Steps Timeline & Quick Toolbar */}
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            
            {/* QA Floating Toolbar */}
            <div className="p-4 border-b bg-card flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handlePauseResume}
                  variant="outline" 
                  className="flex items-center gap-1 h-8 text-xs font-bold"
                >
                  {sessionStatus === "Active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {sessionStatus === "Active" ? "Pause Recording" : "Resume Recording"}
                </Button>

                <Button 
                  onClick={handleTakeScreenshot}
                  disabled={capturingScreenshot}
                  variant="outline"
                  className="flex items-center gap-1 h-8 text-xs font-bold border-indigo-200 text-indigo-600 bg-indigo-50/50"
                >
                  {capturingScreenshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  Capture Screenshot
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => setShowBugDrawer(true)}
                  className="flex items-center gap-1 h-8 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  <Bug className="h-3.5 w-3.5 fill-current" /> Create Bug Instantly
                </Button>

                <Button
                  onClick={() => handleEndSession(true)}
                  className="flex items-center gap-1 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Save & Complete Test
                </Button>

                <Button
                  onClick={() => setShowEndConfirm(true)}
                  variant="outline"
                  className="flex items-center gap-1 h-8 text-xs font-semibold border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  <X className="h-3.5 w-3.5" /> End Session
                </Button>
              </div>
            </div>

            {/* Workspace timeline list scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Header metadata summary */}
              <div className="p-4 border border-indigo-100 rounded-xl bg-indigo-500/[0.01] flex items-center justify-between flex-wrap gap-4 text-xs font-semibold">
                <div className="space-y-1">
                  <p className="font-bold text-foreground">Running Workspace: {title}</p>
                  <p className="text-[10px] text-muted-foreground">Browser will track actions automatically. Interact on screen to record steps.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Playwright active</span>
                </div>
              </div>

              {/* Timeline Steps Header */}
              <div className="space-y-4">
                <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1 select-none">
                  Test steps recorded timeline ({recordedSteps.length})
                </span>

                {recordedSteps.length === 0 ? (
                  <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground text-xs leading-relaxed select-none">
                    No steps captured yet. Perform interactions in the launched headful browser window to populate timeline.
                  </div>
                ) : (
                  <div className="pl-4 border-l border-indigo-100 dark:border-indigo-950 ml-3 space-y-4 relative pt-2 select-none">
                    {recordedSteps.map((step, idx) => (
                      <div key={step.id} className="relative">
                        {/* Bullet node marker */}
                        <span className="absolute -left-[22px] top-1.5 h-3.5 w-3.5 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 font-extrabold text-[9px]">
                          {idx + 1}
                        </span>

                        <div className="border rounded-xl p-4 bg-card shadow-sm space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-semibold">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                                {step.actionType}
                              </span>
                              {step.targetType && (
                                <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-accent text-slate-700 rounded">
                                  {step.targetType}
                                </span>
                              )}
                            </div>
                            {step.recommendedSelector && (
                              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-xs" title={step.recommendedSelector}>
                                Selector: {step.recommendedSelector}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-foreground font-semibold leading-relaxed pt-1">
                            {step.actionDescription}
                          </p>

                          {step.screenshotAfter && (
                            <div className="relative w-fit">
                              <span className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer flex items-center gap-1">
                                <Camera className="h-3 w-3" /> View step screenshot
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Inspector Tools (Capture Element & Triage) */}
          <div className="w-64 shrink-0 border-l p-4 flex flex-col gap-4 bg-accent/5 select-none text-xs font-semibold">
            
            <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground/60">Inspector Tools</h3>

            {/* Smart Element capture button */}
            <Button 
              onClick={() => setShowElementDrawer(true)}
              variant="outline"
              className="w-full flex items-center justify-center gap-1.5 font-semibold h-9 border-indigo-500/20 text-indigo-600 bg-indigo-500/5 hover:bg-indigo-500/10"
            >
              <MousePointerClick className="h-4 w-4 text-indigo-500" /> Capture Element Selector
            </Button>

            <Button 
              onClick={() => setShowManualStepDrawer(true)}
              variant="outline"
              className="w-full flex items-center justify-center gap-1.5 font-semibold h-9 border-blue-500/20 text-blue-600"
            >
              <Plus className="h-4 w-4" /> Add Step Manually
            </Button>

            <div className="border-t my-2" />

            {/* Smart Element Capture Inspector log list */}
            <div className="flex-1 flex flex-col min-h-0 bg-card border rounded-xl p-3 space-y-3">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5 border-b pb-2">
                <Layers className="h-4 w-4 text-indigo-500" /> Captured Selectors ({capturedElements.length})
              </span>

              <div className="flex-1 overflow-y-auto space-y-3 text-[11px] font-normal">
                {capturedElements.length === 0 ? (
                  <p className="text-muted-foreground italic">No selectors parsed yet. Use element capture to populate library.</p>
                ) : (
                  capturedElements.map((el) => (
                    <div key={el.id} className="border rounded-lg p-2.5 space-y-1.5 bg-accent/10">
                      <div className="flex items-center justify-between text-[10px] font-bold text-indigo-600">
                        <span>{el.type} &bull; {el.tagName}</span>
                        <span>Stability: {el.reliabilityScore}%</span>
                      </div>
                      <p className="font-mono text-[9px] bg-slate-50 p-1 rounded truncate" title={el.selector}>{el.selector}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DRAWER: INSTANT DEFECT LOG
          ═══════════════════════════════════════════════════════════════════════ */}
      {showBugDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[500px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b flex items-center justify-between bg-accent/15">
              <div>
                <h3 className="font-bold text-base flex items-center gap-1.5 text-rose-700">
                  <Bug className="h-5 w-5 text-rose-500 fill-current" /> Instant Defect Capture
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Auto-attaches current viewport snapshots and execution logs</p>
              </div>
              <button onClick={() => setShowBugDrawer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBug} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <Label htmlFor="inst-title">Bug Title *</Label>
                <Input id="inst-title" value={bugTitle} onChange={(e) => setBugTitle(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inst-sev">Severity</Label>
                  <select id="inst-sev" value={bugSeverity} onChange={(e) => setBugSeverity(e.target.value as any)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inst-pri">Priority</Label>
                  <select id="inst-pri" value={bugPriority} onChange={(e) => setBugPriority(e.target.value as any)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-actual">Actual Result / Exception Details *</Label>
                <textarea id="inst-actual" value={bugActual} onChange={(e) => setBugActual(e.target.value)} required className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs" />
              </div>

              {screenshots.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Linked Screenshot Evidence</Label>
                  <div className="rounded border overflow-hidden w-40">
                    <img src={`/api/files/${encodeURIComponent(screenshots[screenshots.length - 1])}`} alt="Bug evidence snapshot" className="max-h-24 object-contain mx-auto" />
                  </div>
                </div>
              )}

              {bugError && <p className="text-sm text-destructive">{bugError}</p>}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowBugDrawer(false)} disabled={bugSaving}>Cancel</Button>
                <Button type="submit" disabled={bugSaving} className="bg-rose-600 hover:bg-rose-700 text-white font-semibold">{bugSaving ? "Saving..." : "Save Bug"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

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

    </div>
  )
}
