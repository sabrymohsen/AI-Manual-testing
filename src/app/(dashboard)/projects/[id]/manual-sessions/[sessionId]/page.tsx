"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Save,
  Pause,
  AlertCircle,
  ChevronRight,
  Plus,
  Image as ImageIcon,
  Bug,
  HelpCircle,
  FileText,
  MousePointer,
  Sparkles,
  ChevronLeft,
  Compass,
  Clock,
  Send,
  Camera
} from "lucide-react"
import { ScreenshotAnnotator } from "@/components/ui/screenshot-annotator"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface StepResult {
  id: string
  stepNumber: number
  actionDescription: string
  expectedResult: string | null
  actualResult: string | null
  status: "Pending" | "Running" | "Passed" | "Failed" | "Blocked" | "Warning" | "Skipped"
  notes: string | null
  screenshotPath: string | null
  bugReportId: string | null
}

interface SessionCase {
  id: string
  testCaseId: string
  orderIndex: number
  status: "Pending" | "Running" | "Passed" | "Failed" | "Blocked" | "Warning" | "Skipped"
  testCase: {
    title: string
    module: string | null
    priority: string
    preconditions: string | null
  }
  stepResults: StepResult[]
}

interface ManualSession {
  id: string
  name: string
  status: string
  environment: string
  browserType: string
  viewport: string
  keepBrowserSession: boolean
  stopOnFailure: boolean
  startedAt: string
  project: { name: string }
  sessionCases: SessionCase[]
  notes: Array<{ id: string; note: string; screenshotPath: string | null; pageUrl: string | null; createdAt: string }>
  bugs: Array<{ id: string; title: string; severity: string }>
  credential?: {
    id: string
    roleName: string
    username: string
    loginUrl: string | null
    notes: string | null
  } | null
}

export default function ManualSessionWorkspace() {
  const params = useParams()
  const router = useRouter()
  const search = useSearchParams()
  const projectId = params.id as string
  const sessionId = params.sessionId as string

  /**
   * Where to go after finishing or cancelling this session.
   *
   * Both actions used to hard-code `/projects/{id}`, dumping you on the project
   * overview no matter where you launched the run from — so completing a run
   * started from the test library threw away your place in it.
   *
   * The launcher passes `?returnTo=`. It's constrained to a path inside this
   * project so the parameter can't be used as an open redirect.
   */
  const returnTo = (() => {
    const raw = search.get("returnTo")
    const fallback = `/projects/${projectId}/test-cases`
    if (!raw) return fallback
    if (!raw.startsWith(`/projects/${projectId}`)) return fallback
    // Reject protocol-relative ("//evil.com") and any absolute URL.
    if (raw.startsWith("//")) return fallback
    return raw
  })()

  const [session, setSession] = useState<ManualSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Active state within structured workspace
  const [activeCaseIndex, setActiveCaseIndex] = useState(0)
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  // Multi-select of cases in the queue (bulk mark pass/fail)
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Countdown timer for exploratory mode
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  // Annotator states
  const [annotatingStepId, setAnnotatingStepId] = useState<string | null>(null)
  const [annotatingNoteOnly, setAnnotatingNoteOnly] = useState(false)
  const [annotatingSrc, setAnnotatingSrc] = useState<string | null>(null)

  // Quick Failure Panel state
  const [failingStepId, setFailingStepId] = useState<string | null>(null)
  const [failureActualResult, setFailureActualResult] = useState("")
  const [failureNotes, setFailureNotes] = useState("")
  const [createBugWithFailure, setCreateBugWithFailure] = useState(true)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // General sidebar/feed states
  const [sessionNotes, setSessionNotes] = useState("")
  const [exploratoryNoteScreenshot, setExploratoryNoteScreenshot] = useState<string | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "bugs">("details")

  // Bug Dialog state (exploratory or general manual)
  const [showBugDialog, setShowBugDialog] = useState(false)
  const [bugTitle, setBugTitle] = useState("")
  const [bugSeverity, setBugSeverity] = useState("High")
  const [bugPriority, setBugPriority] = useState("High")
  const [bugSteps, setBugSteps] = useState("")
  const [bugExpected, setBugExpected] = useState("")
  const [bugActual, setBugActual] = useState("")

  // AI states
  const [suggestingStepId, setSuggestingStepId] = useState<string | null>(null)
  const [suggestedResult, setSuggestedResult] = useState<string | null>(null)

  useEffect(() => {
    fetchSessionDetails()
  }, [sessionId])

  const fetchSessionDetails = async () => {
    try {
      const res = await fetch(`/api/manual-sessions/${sessionId}`)
      if (!res.ok) throw new Error("Failed to load manual session details")
      const data = await res.json()
      setSession(data)

      // Find first pending case
      const pendingIdx = data.sessionCases.findIndex((c: any) => c.status === "Pending")
      if (pendingIdx !== -1) {
        setActiveCaseIndex(pendingIdx)
      }
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const toggleCaseSelection = (caseId: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    )
  }

  const handleBulkMarkCases = async (status: "Passed" | "Failed") => {
    if (selectedCaseIds.length === 0) return
    setBulkUpdating(true)
    try {
      const res = await fetch(`/api/manual-sessions/${sessionId}/cases/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCaseIds: selectedCaseIds, status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to update cases")
      }
      setSelectedCaseIds([])
      await fetchSessionDetails()
    } catch (err: any) {
      alert(err.message || "Failed to update selected cases")
    } finally {
      setBulkUpdating(false)
    }
  }

  // Exploratory Mode Data parser
  const getExploratoryData = () => {
    if (!session) return { mission: "", timebox: 30, areas: "" }
    const noteObj = session.notes.find(n => n.note.includes("Exploratory Mission:"))
    if (!noteObj) return { mission: "", timebox: 30, areas: "" }
    
    const lines = noteObj.note.split("\n")
    const mission = lines[0]?.replace("Exploratory Mission: ", "") || ""
    const timebox = parseInt(lines[1]?.replace("Timebox: ", "")?.replace(" mins", "") || "30")
    const areas = lines[2]?.replace("Target Areas: ", "") || ""
    return { mission, timebox, areas }
  }

  // Ticking timebox timer countdown
  useEffect(() => {
    if (!session || session.sessionCases.length > 0) return
    
    const { timebox } = getExploratoryData()
    const expiry = new Date(session.startedAt).getTime() + timebox * 60 * 1000

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000))
      setTimeLeft(diff)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [session])

  // Keyboard Shortcuts Listener for structured sessions
  useEffect(() => {
    if (!session || session.sessionCases.length === 0 || failingStepId || annotatingStepId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      const key = e.key.toLowerCase()
      const currentCase = session.sessionCases[activeCaseIndex]
      if (!currentCase) return
      const currentStep = currentCase.stepResults[activeStepIndex]
      if (!currentStep) return

      if (key === "p") {
        e.preventDefault()
        handleMarkStepStatus(currentStep.id, "Passed")
      } else if (key === "f") {
        e.preventDefault()
        setFailingStepId(currentStep.id)
        setFailureActualResult("")
        setFailureNotes("")
        setCreateBugWithFailure(true)
      } else if (key === "b") {
        e.preventDefault()
        handleMarkStepStatus(currentStep.id, "Blocked")
      } else if (key === "w") {
        e.preventDefault()
        handleMarkStepStatus(currentStep.id, "Warning")
      } else if (key === "k") {
        e.preventDefault()
        handleMarkStepStatus(currentStep.id, "Skipped")
      } else if (key === "n") {
        e.preventDefault()
        const notesEl = document.getElementById(`notes-${currentStep.id}`)
        notesEl?.focus()
      } else if (key === "s") {
        e.preventDefault()
        const fileEl = document.getElementById(`file-${currentStep.id}`)
        fileEl?.click()
      } else if (key === "g") {
        e.preventDefault()
        handleCreateBugDirectly(currentStep)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [session, activeCaseIndex, activeStepIndex, failingStepId, annotatingStepId])

  const handleMarkStepStatus = async (stepResultId: string, status: StepResult["status"]) => {
    if (!session) return
    try {
      const res = await fetch(`/api/manual-step-results/${stepResultId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      })
      if (!res.ok) throw new Error("Failed to update status")
      
      updateLocalStepResult(stepResultId, { status })
      goToNextStep()
    } catch (err: any) {
      alert("Failed to save result: " + err.message)
    }
  }

  const handleSaveFailure = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || !failingStepId) return

    try {
      const res = await fetch(`/api/manual-step-results/${failingStepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Failed",
          actualResult: failureActualResult,
          notes: failureNotes
        })
      })
      if (!res.ok) throw new Error("Failed to save step failure")

      updateLocalStepResult(failingStepId, {
        status: "Failed",
        actualResult: failureActualResult,
        notes: failureNotes
      })

      if (createBugWithFailure) {
        await handleCreateBugDirectly({
          id: failingStepId,
          actualResult: failureActualResult,
          notes: failureNotes
        } as any)
      }

      setFailingStepId(null)
      goToNextStep()
    } catch (err: any) {
      alert("Error saving failure: " + err.message)
    }
  }

  const handleCreateBugDirectly = async (step: StepResult) => {
    try {
      const res = await fetch(`/api/manual-step-results/${step.id}/bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualResult: step.actualResult || "Step failed during manual testing.",
          notes: step.notes
        })
      })
      if (!res.ok) throw new Error("Failed to generate bug report")
      const bug = await res.json()
      
      if (session) {
        setSession({
          ...session,
          bugs: [...session.bugs, { id: bug.id, title: bug.title, severity: bug.severity }]
        })
      }
      
      alert(`Bug report created successfully: "${bug.title}"`)
      fetchSessionDetails()
    } catch (err: any) {
      alert("Failed to create bug: " + err.message)
    }
  }

  // Create Bug directly from exploratory workspace note
  const handleCreateExploratoryBug = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return

    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bugTitle,
          severity: bugSeverity,
          priority: bugPriority,
          stepsToReproduce: bugSteps,
          expectedResult: bugExpected,
          actualResult: bugActual,
          manualTestSessionId: sessionId
        })
      })
      if (!res.ok) throw new Error("Failed to submit bug report")
      
      setShowBugDialog(false)
      setBugTitle("")
      setBugSteps("")
      setBugExpected("")
      setBugActual("")
      
      alert("Bug report created successfully!")
      fetchSessionDetails()
    } catch (err: any) {
      alert("Failed to create bug: " + err.message)
    }
  }

  const updateLocalStepResult = (stepResultId: string, fields: Partial<StepResult>) => {
    if (!session) return
    const updatedCases = session.sessionCases.map((c) => {
      const match = c.stepResults.find((s) => s.id === stepResultId)
      if (match) {
        return {
          ...c,
          stepResults: c.stepResults.map((s) => (s.id === stepResultId ? { ...s, ...fields } : s))
        }
      }
      return c
    })
    setSession({ ...session, sessionCases: updatedCases })
  }

  const goToNextStep = () => {
    if (!session) return
    const currentCase = session.sessionCases[activeCaseIndex]
    if (!currentCase) return

    if (activeStepIndex < currentCase.stepResults.length - 1) {
      setActiveStepIndex(activeStepIndex + 1)
    } else {
      if (activeCaseIndex < session.sessionCases.length - 1) {
        setActiveCaseIndex(activeCaseIndex + 1)
        setActiveStepIndex(0)
      }
    }
  }

  const goToPrevStep = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1)
    } else if (activeCaseIndex > 0) {
      const prevCase = session?.sessionCases[activeCaseIndex - 1]
      setActiveCaseIndex(activeCaseIndex - 1)
      setActiveStepIndex(prevCase ? prevCase.stepResults.length - 1 : 0)
    }
  }

  // Handle local screenshot select
  const handleScreenshotChange = (stepResultId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setAnnotatingStepId(stepResultId)
      setAnnotatingNoteOnly(false)
      setAnnotatingSrc(base64)
    }
    reader.readAsDataURL(file)
  }

  // Handle screenshot select inside Exploratory workspace note logger
  const handleExploratoryScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setAnnotatingStepId(sessionId)
      setAnnotatingNoteOnly(true)
      setAnnotatingSrc(base64)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveAnnotatedScreenshot = async (annotatedBase64: string) => {
    if (annotatingNoteOnly) {
      // Store local base64 screenshot to attach to note log
      setExploratoryNoteScreenshot(annotatedBase64)
      setAnnotatingStepId(null)
      setAnnotatingSrc(null)
      return
    }

    if (!annotatingStepId) return

    try {
      const res = await fetch(`/api/manual-step-results/${annotatingStepId}/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: annotatedBase64 })
      })
      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()

      updateLocalStepResult(annotatingStepId, {
        screenshotPath: data.screenshotPath
      })
      setAnnotatingStepId(null)
      setAnnotatingSrc(null)
    } catch (err: any) {
      alert("Failed to upload screenshot: " + err.message)
    }
  }

  const handleLogExploratoryNote = async () => {
    if (!session || !sessionNotes.trim()) return
    setSavingNotes(true)
    try {
      let screenshotPath = null
      if (exploratoryNoteScreenshot) {
        // Upload screenshot and get path first
        const uploadRes = await fetch(`/api/manual-step-results/${sessionId}/screenshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: exploratoryNoteScreenshot })
        })
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          screenshotPath = uploadData.screenshotPath
        }
      }

      const res = await fetch(`/api/manual-sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: session.name,
          note: sessionNotes,
          screenshotPath
        })
      })
      if (!res.ok) throw new Error("Failed to log exploratory note")
      
      setSessionNotes("")
      setExploratoryNoteScreenshot(null)
      fetchSessionDetails()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleCompleteSession = () => {
    setShowCompleteConfirm(true)
  }

  const confirmCompleteSession = async () => {
    const res = await fetch(`/api/manual-sessions/${sessionId}/complete`, {
      method: "POST"
    })
    if (!res.ok) throw new Error("Failed to complete session")
    setShowCompleteConfirm(false)
    router.push(returnTo)
  }

  const handleCancelSession = () => {
    setShowCancelConfirm(true)
  }

  const confirmCancelSession = async () => {
    const res = await fetch(`/api/manual-sessions/${sessionId}/cancel`, {
      method: "POST"
    })
    if (!res.ok) throw new Error("Failed to cancel session")
    setShowCancelConfirm(false)
    router.push(returnTo)
  }

  const handleSuggestExpected = async (step: StepResult) => {
    setSuggestingStepId(step.id)
    setSuggestedResult(null)
    try {
      const res = await fetch("/api/ai/suggest-expected-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionDescription: step.actionDescription,
          testCaseTitle: session?.sessionCases[activeCaseIndex]?.testCase.title
        })
      })
      if (!res.ok) throw new Error("AI suggestion failed")
      const data = await res.json()
      setSuggestedResult(data.suggestion)
    } catch (err: any) {
      setSuggestedResult("AI suggestion failed: " + err.message)
    } finally {
      setSuggestingStepId(null)
    }
  }

  const formatTimeLeft = (sec: number) => {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 bg-slate-900 min-h-screen text-slate-400">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-300 font-medium">Launching Continuous Session workspace...</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="p-8 text-center text-red-600 min-h-screen bg-slate-900">
        ⚠️ Error: {error || "Session not found"}
      </div>
    )
  }

  const totalSteps = session.sessionCases.reduce((acc, c) => acc + c.stepResults.length, 0)
  const completedSteps = session.sessionCases.reduce((acc, c) => acc + c.stepResults.filter(s => s.status !== "Pending").length, 0)
  const completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  // 1. Render Exploratory Session View
  const isExploratory = session.sessionCases.length === 0
  const exploratory = getExploratoryData()

  if (isExploratory) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100">
        {/* Header bar */}
        <header className="bg-slate-950 border-b border-slate-800 p-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${projectId}`}>
              <Button variant="ghost" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 h-8 px-2 rounded-lg">
                <ChevronLeft size={16} /> Back
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
                <Compass className="text-blue-500" />
                {session.name}
              </h1>
              <p className="text-xs text-slate-400">
                Browser: {session.browserType} | Viewport: {session.viewport} | Env: {session.environment}
              </p>
            </div>
          </div>

          {/* Timebox Countdown clock */}
          {timeLeft !== null && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1">
                <Clock size={16} className={timeLeft < 60 ? "text-red-500 animate-pulse" : "text-blue-400"} />
                <span className={`font-mono text-sm font-bold ${timeLeft < 60 ? "text-red-500" : "text-slate-200"}`}>
                  {timeLeft === 0 ? "TIMEBOX EXPIRED" : formatTimeLeft(timeLeft)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleCompleteSession} className="bg-green-600 hover:bg-green-700 text-white font-semibold h-9 px-4 rounded-xl text-xs flex items-center gap-1.5">
                  Complete Session
                </Button>
                <Button onClick={handleCancelSession} variant="ghost" className="text-slate-400 hover:text-red-400 hover:bg-slate-800 h-9 px-3 rounded-xl text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </header>

        {/* Main Side-by-Side view */}
        <div className="flex-grow flex overflow-hidden">
          {/* Left Panel: Mission details */}
          <aside className="w-80 bg-slate-950 border-r border-slate-800 p-4 space-y-6 overflow-y-auto shrink-0">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Testing Mission</h3>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-800">
                {exploratory.mission || "Explore application capabilities and log outcomes."}
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Areas/Modules Covered</h3>
              <div className="flex flex-wrap gap-1.5">
                {(exploratory.areas || "App features").split(",").map((a, i) => (
                  <span key={i} className="text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-0.5">
                    {a.trim()}
                  </span>
                ))}
              </div>
            </div>

            <Button onClick={() => setShowBugDialog(true)} className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl py-2 flex items-center justify-center gap-1.5 shadow-md">
              <Bug size={14} /> Log Bug Report
            </Button>
          </aside>

          {/* Center Panel: Timeline log feed + note inputs */}
          <main className="flex-1 bg-slate-900 flex flex-col overflow-hidden">
            {/* Log inputs card */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Log Exploratory Event</h3>
              <div className="flex gap-3">
                <textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Record what you observed, testing questions, or user behavior risks..."
                  className="flex-grow bg-slate-900 border border-slate-850 px-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-white h-16 resize-none"
                />
                <div className="flex flex-col gap-2 justify-end">
                  <input
                    type="file"
                    accept="image/*"
                    id="exploratory-screenshot"
                    onChange={handleExploratoryScreenshotChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    onClick={() => document.getElementById("exploratory-screenshot")?.click()}
                    className="h-8 w-8 p-0 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-400 rounded-lg flex items-center justify-center"
                    title="Attach screenshot"
                  >
                    <Camera size={16} />
                  </Button>
                  <Button
                    onClick={handleLogExploratoryNote}
                    disabled={savingNotes || !sessionNotes.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 rounded-lg text-xs flex items-center gap-1"
                  >
                    <Send size={12} /> Log
                  </Button>
                </div>
              </div>

              {exploratoryNoteScreenshot && (
                <div className="relative inline-block mt-2">
                  <img
                    src={exploratoryNoteScreenshot}
                    className="h-12 border border-slate-800 rounded object-contain bg-slate-900"
                    alt="Attaching"
                  />
                  <button
                    type="button"
                    onClick={() => setExploratoryNoteScreenshot(null)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5"
                  >
                    <XCircle size={10} />
                  </button>
                </div>
              )}
            </div>

            {/* Timeline Log Feed */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Exploratory Log Timeline</h3>
              
              {session.notes.filter(n => !n.note.includes("Exploratory Mission:")).length === 0 ? (
                <p className="text-xs text-slate-500 italic py-12 text-center">No timeline events logged yet. Type notes or drop screenshots above.</p>
              ) : (
                <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                  {session.notes.filter(n => !n.note.includes("Exploratory Mission:")).map((n) => (
                    <div key={n.id} className="relative pl-8 flex gap-3 items-start group">
                      <span className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-slate-900"></span>
                      <div className="flex-grow bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <span>Observation Event</span>
                          <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="text-xs text-slate-200">{n.note}</p>
                        
                        {n.screenshotPath && (
                          <div className="pt-2">
                            <img
                              src={`/api/files/${n.screenshotPath}`}
                              className="h-32 border border-slate-800 rounded-lg object-contain bg-slate-950 cursor-pointer hover:border-slate-500"
                              onClick={() => window.open(`/api/files/${n.screenshotPath}`)}
                              alt="Logged screenshot"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* Right Panel: Bugs logged */}
          <aside className="w-80 bg-slate-950 border-l border-slate-800 p-4 space-y-4 overflow-y-auto shrink-0">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Exploratory Bugs Found ({session.bugs.length})</h3>
            {session.bugs.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No bugs reported yet in this session.</p>
            ) : (
              <div className="space-y-2">
                {session.bugs.map((b) => (
                  <div key={b.id} className="p-3 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-200 block truncate max-w-[200px]">{b.title}</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Severity: {b.severity}</span>
                    </div>
                    <Bug size={14} className="text-red-500" />
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        {/* Bug Dialog overlay */}
        {showBugDialog && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <form onSubmit={handleCreateExploratoryBug} className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-lg p-6 space-y-4 text-slate-100 animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <Bug className="text-red-500" /> Log Exploratory Bug
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Bug Title</label>
                  <input
                    type="text"
                    required
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    placeholder="Concise issue summary..."
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Severity</label>
                    <select
                      value={bugSeverity}
                      onChange={(e) => setBugSeverity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Priority</label>
                    <select
                      value={bugPriority}
                      onChange={(e) => setBugPriority(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Steps to Reproduce</label>
                  <textarea
                    value={bugSteps}
                    onChange={(e) => setBugSteps(e.target.value)}
                    placeholder="1. Open app... 2. Click button..."
                    className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded-xl text-xs text-white focus:outline-none h-16 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Expected Result</label>
                    <input
                      type="text"
                      value={bugExpected}
                      onChange={(e) => setBugExpected(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Actual Result</label>
                    <input
                      type="text"
                      value={bugActual}
                      onChange={(e) => setBugActual(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowBugDialog(false)} className="h-9 px-4 rounded-xl border-slate-800 hover:bg-slate-800 text-slate-300 text-xs">
                  Cancel
                </Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-semibold h-9 px-5 rounded-xl text-xs flex items-center gap-1">
                  Log Bug
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Screenshot Annotator overlay */}
        {annotatingStepId && annotatingSrc && (
          <ScreenshotAnnotator
            imageSrc={annotatingSrc}
            onSave={handleSaveAnnotatedScreenshot}
            onCancel={() => {
              setAnnotatingStepId(null)
              setAnnotatingSrc(null)
            }}
          />
        )}

        <ConfirmDialog
          open={showCompleteConfirm}
          title="Complete Session"
          description="Are you sure you want to complete this session and calculate elapsed duration?"
          confirmLabel="Complete"
          onConfirm={confirmCompleteSession}
          onCancel={() => setShowCompleteConfirm(false)}
        />

        <ConfirmDialog
          open={showCancelConfirm}
          title="Cancel Session"
          description="Are you sure you want to cancel the current manual session? All progress will be lost."
          variant="danger"
          confirmLabel="Yes, Cancel Session"
          onConfirm={confirmCancelSession}
          onCancel={() => setShowCancelConfirm(false)}
        />
      </div>
    )
  }

  // 2. Render Structured Run View (Existing layout)
  const currentCase = session.sessionCases[activeCaseIndex]
  const activeStep = currentCase?.stepResults[activeStepIndex]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Header Navigation Toolbar */}
      <header className="bg-slate-950 border-b border-slate-800 p-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 h-8 px-2 rounded-lg">
              <ChevronLeft size={16} /> Back to Project
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
              <Play size={14} className="text-green-500 fill-green-500" />
              {session.name}
            </h1>
            <p className="text-xs text-slate-400">
              Project: {session.project.name} | Browser: {session.browserType} | Environment: {session.environment}
            </p>
          </div>
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Session Progress</span>
            <div className="flex items-center gap-3">
              <div className="w-32 bg-slate-800 rounded-full h-2">
                <div style={{ width: `${completionPercent}%` }} className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"></div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-200">{completionPercent}% ({completedSteps}/{totalSteps} steps)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleCompleteSession} className="bg-green-600 hover:bg-green-700 text-white font-semibold h-9 px-4 rounded-xl text-xs flex items-center gap-1.5">
              <CheckCircle size={14} /> Complete Run
            </Button>
            <Button onClick={handleCancelSession} variant="ghost" className="text-slate-400 hover:text-red-400 hover:bg-slate-800 h-9 px-3 rounded-xl text-xs">
              Cancel
            </Button>
          </div>
        </div>
      </header>

      {/* Side-By-Side Main Layout Grid */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Test Case Queue */}
        <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <FileText size={12} /> Test Case Queue
            </h2>
            <span className="text-[10px] text-slate-500">Tick cases to bulk-mark, or click a case to run its steps</span>

            {session.sessionCases.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedCaseIds.length === session.sessionCases.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedCaseIds.length > 0 && selectedCaseIds.length < session.sessionCases.length
                    }}
                    onChange={(e) =>
                      setSelectedCaseIds(e.target.checked ? session.sessionCases.map((c) => c.id) : [])
                    }
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 cursor-pointer"
                  />
                  Select all
                </label>
                {selectedCaseIds.length > 0 && (
                  <span className="text-[10px] font-bold text-blue-400">{selectedCaseIds.length} selected</span>
                )}
              </div>
            )}

            {selectedCaseIds.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  onClick={() => handleBulkMarkCases("Passed")}
                  disabled={bulkUpdating}
                  className="h-7 flex-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <CheckCircle size={12} /> Mark Passed
                </Button>
                <Button
                  onClick={() => handleBulkMarkCases("Failed")}
                  disabled={bulkUpdating}
                  variant="outline"
                  className="h-7 border-red-900 text-red-400 hover:bg-red-950/40 text-[10px] font-bold flex items-center justify-center gap-1 px-2"
                >
                  <XCircle size={12} /> Fail
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-900">
            {session.sessionCases.map((c, index) => {
              const isActive = index === activeCaseIndex
              const isCasePassed = c.stepResults.every(s => s.status === "Passed") && c.stepResults.length > 0
              const isCaseFailed = c.stepResults.some(s => s.status === "Failed")
              const isCaseBlocked = c.stepResults.some(s => s.status === "Blocked")

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveCaseIndex(index)
                    setActiveStepIndex(0)
                  }}
                  className={`p-3 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-all ${
                    isActive ? "bg-blue-950/40 border border-blue-900/60" : "border border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-bold truncate flex items-start gap-2 ${isActive ? "text-blue-400" : "text-slate-300"}`}>
                      <input
                        type="checkbox"
                        checked={selectedCaseIds.includes(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleCaseSelection(c.id)}
                        className="h-3.5 w-3.5 mt-0.5 rounded border-slate-600 bg-slate-800 cursor-pointer shrink-0"
                      />
                      <span className="truncate">{index + 1}. {c.testCase.title}</span>
                    </span>
                    <span className="shrink-0">
                      {isCaseFailed ? <XCircle size={14} className="text-red-500" /> :
                       isCaseBlocked ? <AlertCircle size={14} className="text-orange-500" /> :
                       isCasePassed ? <CheckCircle size={14} className="text-green-500" /> :
                       <HelpCircle size={14} className="text-slate-600" />}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
                    <span>{c.testCase.module || "General"}</span>
                    <span>{c.stepResults.filter(s => s.status !== "Pending").length}/{c.stepResults.length} steps</span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Center Panel: Active Test Case Details + Steps */}
        <main className="flex-1 bg-slate-900 overflow-y-auto flex flex-col">
          {currentCase ? (
            <div className="flex-1 flex flex-col p-6 space-y-6">
              
              {/* Header Details */}
              <div className="bg-slate-950/40 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider bg-slate-800 px-2 py-0.5 rounded">
                    Active Test Case
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    currentCase.testCase.priority === "Critical" ? "bg-red-950 text-red-400 border border-red-900" :
                    currentCase.testCase.priority === "High" ? "bg-orange-950 text-orange-400 border border-orange-900" :
                    "bg-slate-800 text-slate-400"
                  }`}>
                    {currentCase.testCase.priority}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{currentCase.testCase.title}</h2>
                {currentCase.testCase.preconditions && (
                  <p className="text-xs text-slate-400 font-mono bg-slate-900/50 p-2.5 border border-slate-800 rounded-lg">
                    <span className="font-bold text-slate-300">PRECONDITIONS:</span> {currentCase.testCase.preconditions}
                  </p>
                )}
              </div>

              {/* Steps */}
              <div className="flex-grow space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Step Results Checklist</h3>
                  <div className="flex items-center gap-1.5">
                    <Button onClick={goToPrevStep} variant="ghost" className="h-7 w-7 p-0 hover:bg-slate-800 text-slate-400 rounded-lg">
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs font-mono text-slate-400">Step {activeStepIndex + 1} of {currentCase.stepResults.length}</span>
                    <Button onClick={goToNextStep} variant="ghost" className="h-7 w-7 p-0 hover:bg-slate-800 text-slate-400 rounded-lg">
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {currentCase.stepResults.map((step, idx) => {
                    const isStepActive = idx === activeStepIndex
                    return (
                      <div
                        key={step.id}
                        onClick={() => setActiveStepIndex(idx)}
                        className={`p-4 border rounded-xl transition-all ${
                          isStepActive ? "bg-slate-950 border-blue-600 shadow-md ring-1 ring-blue-500/20" : "bg-slate-950/30 border-slate-800/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-grow space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">
                                Step {step.stepNumber}
                              </span>
                              <p className="text-sm font-semibold text-white">{step.actionDescription}</p>
                            </div>
                            {step.expectedResult && (
                              <div className="pl-2 border-l-2 border-slate-700 text-xs text-slate-400">
                                <span className="font-semibold text-slate-300">Expected:</span> {step.expectedResult}
                              </div>
                            )}

                            {isStepActive && (
                              <div className="mt-3 space-y-2 pt-2 border-t border-slate-900">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Actual Result</label>
                                  <input
                                    type="text"
                                    value={step.actualResult || ""}
                                    placeholder="Observed behavior..."
                                    onChange={(e) => updateLocalStepResult(step.id, { actualResult: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-white"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Notes</label>
                                    <input
                                      type="text"
                                      id={`notes-${step.id}`}
                                      value={step.notes || ""}
                                      placeholder="Add remarks..."
                                      onChange={(e) => updateLocalStepResult(step.id, { notes: e.target.value })}
                                      className="w-full bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs focus:outline-none text-white"
                                    />
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      id={`file-${step.id}`}
                                      onChange={(e) => handleScreenshotChange(step.id, e)}
                                      className="hidden"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => document.getElementById(`file-${step.id}`)?.click()}
                                      className="text-xs bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center gap-1.5 h-8 py-1"
                                    >
                                      <ImageIcon size={14} /> {step.screenshotPath ? "Replace Screenshot" : "Add Screenshot"}
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => handleSuggestExpected(step)}
                                      className="text-xs hover:bg-slate-800 text-blue-400 hover:text-blue-300 rounded-lg flex items-center gap-1 h-8 py-1"
                                    >
                                      <Sparkles size={14} /> Suggest Expected
                                    </Button>
                                  </div>
                                </div>

                                {suggestedResult && (
                                  <div className="p-2.5 bg-blue-950/20 border border-blue-900/40 rounded-lg text-xs text-blue-300 space-y-1">
                                    <span className="font-bold flex items-center gap-1"><Sparkles size={12} /> AI Expected Result Suggestion:</span>
                                    <p>{suggestedResult}</p>
                                    <div className="flex justify-end gap-2 mt-1">
                                      <Button size="sm" onClick={() => {
                                        updateLocalStepResult(step.id, { expectedResult: suggestedResult })
                                        setSuggestedResult(null)
                                      }} className="bg-blue-600 hover:bg-blue-700 h-6 text-[10px] py-0 px-2 text-white">Accept Suggestion</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setSuggestedResult(null)} className="h-6 text-[10px] py-0 px-2 text-slate-400 hover:text-slate-200">Dismiss</Button>
                                    </div>
                                  </div>
                                )}

                                {step.screenshotPath && (
                                  <div className="mt-2 relative inline-block">
                                    <img
                                      src={`/api/files/${step.screenshotPath}`}
                                      className="h-16 w-auto border border-slate-800 rounded-lg object-contain bg-slate-950 cursor-pointer hover:border-slate-500"
                                      onClick={() => window.open(`/api/files/${step.screenshotPath}`)}
                                      alt="Step screenshot"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateLocalStepResult(step.id, { screenshotPath: null })}
                                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700"
                                    >
                                      <XCircle size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 flex flex-wrap gap-1 items-center justify-end">
                            <button
                              type="button"
                              onClick={() => handleMarkStepStatus(step.id, "Passed")}
                              className={`h-7 px-3 text-xs font-bold rounded-lg border flex items-center gap-1 transition-all ${
                                step.status === "Passed" ? "bg-green-950/80 border-green-500 text-green-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-green-400 hover:bg-green-950/20"
                              }`}
                            >
                              Pass
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFailingStepId(step.id)
                                setFailureActualResult("")
                                setFailureNotes("")
                                setCreateBugWithFailure(true)
                              }}
                              className={`h-7 px-3 text-xs font-bold rounded-lg border flex items-center gap-1 transition-all ${
                                step.status === "Failed" ? "bg-red-950/80 border-red-500 text-red-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/20"
                              }`}
                            >
                              Fail
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkStepStatus(step.id, "Blocked")}
                              className={`h-7 px-3 text-xs font-bold rounded-lg border flex items-center gap-1 transition-all ${
                                step.status === "Blocked" ? "bg-orange-950/80 border-orange-500 text-orange-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-orange-400 hover:bg-orange-950/20"
                              }`}
                            >
                              Block
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkStepStatus(step.id, "Warning")}
                              className={`h-7 px-3 text-xs font-bold rounded-lg border flex items-center gap-1 transition-all ${
                                step.status === "Warning" ? "bg-amber-950/80 border-amber-500 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400 hover:bg-amber-950/20"
                              }`}
                            >
                              Warn
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkStepStatus(step.id, "Skipped")}
                              className={`h-7 px-3 text-xs font-bold rounded-lg border flex items-center gap-1 transition-all ${
                                step.status === "Skipped" ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                              }`}
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center text-slate-400">
              Select test case queue list item on sidebar.
            </div>
          )}
        </main>

        {/* Right Panel: Workspace Tabs */}
        <aside className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col overflow-hidden shrink-0">
          <div className="flex border-b border-slate-800 text-xs font-semibold text-slate-400">
            <button
              onClick={() => setActiveTab("details")}
              className={`flex-1 py-3 border-b-2 text-center transition-all ${activeTab === "details" ? "border-blue-500 text-white bg-slate-900" : "border-transparent hover:text-white"}`}
            >
              Session Info
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex-1 py-3 border-b-2 text-center transition-all ${activeTab === "notes" ? "border-blue-500 text-white bg-slate-900" : "border-transparent hover:text-white"}`}
            >
              Session Notes
            </button>
            <button
              onClick={() => setActiveTab("bugs")}
              className={`flex-1 py-3 border-b-2 text-center transition-all ${activeTab === "bugs" ? "border-blue-500 text-white bg-slate-900" : "border-transparent hover:text-white"}`}
            >
              Session Bugs
            </button>
          </div>

          <div className="flex-grow p-4 overflow-y-auto">
            {activeTab === "details" && (
              <div className="space-y-4">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase text-slate-400">Environment Details</h3>
                  <div className="text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between"><span className="text-slate-500">Browser:</span> <span>{session.browserType}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Viewport:</span> <span>{session.viewport}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Credential:</span> <span>{session.credential ? session.credential.roleName : "None"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Env:</span> <span>{session.environment}</span></div>
                  </div>
                </div>

                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase text-slate-400">Hotkeys Quick Cheat</h3>
                  <div className="text-[11px] font-mono space-y-1.5 text-slate-400">
                    <div><span className="text-blue-400 font-bold bg-slate-950 px-1 rounded">P</span> : Pass Step</div>
                    <div><span className="text-red-400 font-bold bg-slate-950 px-1 rounded">F</span> : Fail Step</div>
                    <div><span className="text-orange-400 font-bold bg-slate-950 px-1 rounded">B</span> : Block Step</div>
                    <div><span className="text-amber-400 font-bold bg-slate-950 px-1 rounded">W</span> : Warn Step</div>
                    <div><span className="text-slate-300 font-bold bg-slate-950 px-1 rounded">K</span> : Skip Step</div>
                    <div><span className="text-slate-300 font-bold bg-slate-950 px-1 rounded">S</span> : Upload screenshot</div>
                    <div><span className="text-slate-300 font-bold bg-slate-950 px-1 rounded">N</span> : Focus Notes</div>
                    <div><span className="text-red-400 font-bold bg-slate-950 px-1 rounded">G</span> : Auto Bug Report</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notes" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Append Session Note</label>
                  <textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Type notes or exploratory notes..."
                    className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-white h-24 resize-none"
                  />
                  <Button
                    onClick={async () => {
                      if (!sessionNotes.trim()) return
                      setSavingNotes(true)
                      try {
                        await fetch(`/api/manual-sessions/${sessionId}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: session.name, note: sessionNotes })
                        })
                        alert("Session note logged successfully!")
                        setSessionNotes("")
                        fetchSessionDetails()
                      } catch {} finally {
                        setSavingNotes(false)
                      }
                    }}
                    disabled={savingNotes || !sessionNotes.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 mt-2 rounded-lg"
                  >
                    Log note
                  </Button>
                </div>

                <div className="border-t border-slate-850 pt-4 space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase">Logged Notes feed ({session.notes.length})</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {session.notes.map((n) => (
                      <div key={n.id} className="p-2.5 bg-slate-900 border border-slate-850 rounded-xl text-[11px]">
                        <p className="text-slate-300">{n.note}</p>
                        <span className="text-[9px] text-slate-500 block mt-1">
                          {new Date(n.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "bugs" && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">Bugs logged in this session ({session.bugs.length})</h3>
                {session.bugs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No bug reports created during this session.</p>
                ) : (
                  session.bugs.map((b) => (
                    <div key={b.id} className="p-2.5 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200 block truncate max-w-[180px]">{b.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono">Severity: {b.severity}</span>
                      </div>
                      <Bug size={14} className="text-red-500" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

      </div>

      {/* Overlay Modal Dialog: Screenshot Annotation Canvas */}
      {annotatingStepId && annotatingSrc && (
        <ScreenshotAnnotator
          imageSrc={annotatingSrc}
          onSave={handleSaveAnnotatedScreenshot}
          onCancel={() => {
            setAnnotatingStepId(null)
            setAnnotatingSrc(null)
          }}
        />
      )}

      {/* Overlay Modal Dialog: Quick Failure Panel */}
      {failingStepId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveFailure} className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200 text-slate-100 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
              <AlertTriangle className="text-red-500" /> Step Failure Details
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Actual Result (Required)</label>
              <textarea
                required
                value={failureActualResult}
                onChange={(e) => setFailureActualResult(e.target.value)}
                placeholder="What went wrong? Describe actual behavior..."
                className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded-xl text-xs focus:outline-none text-white h-20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Failure Notes (Optional)</label>
              <input
                type="text"
                value={failureNotes}
                onChange={(e) => setFailureNotes(e.target.value)}
                placeholder="Additional details..."
                className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs focus:outline-none text-white"
              />
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="createBug"
                checked={createBugWithFailure}
                onChange={(e) => setCreateBugWithFailure(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-slate-850 rounded focus:ring-blue-500 bg-slate-950"
              />
              <label htmlFor="createBug" className="text-xs font-medium text-slate-300">
                Create AI Bug Report automatically
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4 mt-6">
              <Button type="button" variant="outline" onClick={() => setFailingStepId(null)} className="h-9 px-4 rounded-xl border-slate-800 hover:bg-slate-800 text-slate-300 text-xs">
                Cancel
              </Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-semibold h-9 px-5 rounded-xl text-xs flex items-center gap-1">
                Save & Fail Step
              </Button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={showCompleteConfirm}
        title="Complete Run"
        description="Are you sure you want to complete this session and calculate elapsed duration?"
        confirmLabel="Complete"
        onConfirm={confirmCompleteSession}
        onCancel={() => setShowCompleteConfirm(false)}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Session"
        description="Are you sure you want to cancel the current manual session? All progress will be lost."
        variant="danger"
        confirmLabel="Yes, Cancel Session"
        onConfirm={confirmCancelSession}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  )
}
