"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Brain,
  ChevronLeft,
  RefreshCw,
  Activity,
  Zap,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  LayoutGrid,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Check,
  Save,
  Trash,
  AlertCircle
} from "lucide-react"

interface Step {
  id: string
  stepNumber: number
  name: string
  type: string
  status: string
  error: string | null
  screenshotPath: string | null
  details: any
  startedAt: string | null
  completedAt: string | null
}

interface Finding {
  id: string
  type: string
  severity: string
  title: string
  description: string | null
  evidence: any
  bugReportId: string | null
}

interface RunEvent {
  id: string
  level: string
  phase: string | null
  message: string
  createdAt: string
}

interface QAAgentRun {
  id: string
  status: string
  mode: string
  goal: string
  safetyLevel: string
  scope: any
  plan: any
  scannerResult: any
  summary: any
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  steps: Step[]
  findings: Finding[]
  events: RunEvent[]
  project: {
    name: string
    webAppUrl: string
  }
  currentPhase: string | null
  currentMessage: string | null
  lastHeartbeatAt: string | null
  failedReason: string | null
  failedAt: string | null
  errorStack: string | null
  durationMs: number
  progress?: number
  credentialRole?: string | null
  currentPhaseStartedAt?: string | null
  workerHealth?: {
    status: string
    secondsSinceHeartbeat: number | null
  }
  queueDiagnostics?: {
    queueName: string
    jobId: string | null
    jobState: string
    waitingJobs: number
    activeJobs: number
    failedJobs: number
    workerOnline: boolean
  }
}

export default function QAAgentTelemetryDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [run, setRun] = useState<QAAgentRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null)
  
  // Local plan editing state for Semi-Autonomous approval modal
  const [editingPlanTests, setEditingPlanTests] = useState<any[] | null>(null)
  const [approving, setApproving] = useState(false)
  const [savingTests, setSavingTests] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Cancel Confirmation Modal & Force Stop State
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showForceStopModal, setShowForceStopModal] = useState(false)
  const [forceStopping, setForceStopping] = useState(false)

  // Live Timer states
  const [liveTimers, setLiveTimers] = useState({
    elapsedStr: "00:00:00",
    phaseElapsedStr: "00:00"
  })

  // Warning metrics
  const [queuedSeconds, setQueuedSeconds] = useState(0)
  const [phaseSeconds, setPhaseSeconds] = useState(0)

  useEffect(() => {
    fetchRunDetails()

    let intervalId: any
    // Poll updates every 2 seconds while active
    const isFinished = ["Completed", "Failed", "Cancelled"].includes(run?.status || "")
    if (!isFinished) {
      intervalId = setInterval(() => {
        fetchRunDetails(false)
      }, 2000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [params.id, params.agentRunId, run?.status])

  // Timer Engine updating every second
  useEffect(() => {
    if (!run) return

    const timer = setInterval(() => {
      // 1. Calculate Elapsed Time
      const startTime = run.startedAt ? new Date(run.startedAt).getTime() : new Date(run.createdAt).getTime()
      const endTime = ["Completed", "Failed", "Cancelled"].includes(run.status) && run.completedAt
        ? new Date(run.completedAt).getTime()
        : Date.now()
      
      const diffSecs = Math.max(0, Math.floor((endTime - startTime) / 1000))
      const hrs = Math.floor(diffSecs / 3600).toString().padStart(2, "0")
      const mins = Math.floor((diffSecs % 3600) / 60).toString().padStart(2, "0")
      const secs = (diffSecs % 60).toString().padStart(2, "0")
      
      const label = run.status === "Queued" ? "Waiting time" :
                    ["Completed", "Failed", "Cancelled"].includes(run.status) ? "Total duration" : "Elapsed time"
      const elapsedStr = `${label}: ${hrs}:${mins}:${secs}`

      // 2. Calculate Current Phase Time
      const phaseStartTime = run.currentPhaseStartedAt ? new Date(run.currentPhaseStartedAt).getTime() : new Date(run.createdAt).getTime()
      const phaseEndTime = ["Completed", "Failed", "Cancelled"].includes(run.status) && run.completedAt
        ? new Date(run.completedAt).getTime()
        : Date.now()
      
      const phaseDiffSecs = Math.max(0, Math.floor((phaseEndTime - phaseStartTime) / 1000))
      const pMins = Math.floor(phaseDiffSecs / 60).toString().padStart(2, "0")
      const pSecs = (phaseDiffSecs % 60).toString().padStart(2, "0")
      const phaseElapsedStr = `${pMins}:${pSecs}`

      setLiveTimers({ elapsedStr, phaseElapsedStr })

      // 3. Track warning seconds
      if (run.status === "Queued") {
        setQueuedSeconds(Math.max(0, Math.floor((Date.now() - new Date(run.createdAt).getTime()) / 1000)))
      } else {
        setQueuedSeconds(0)
      }
      setPhaseSeconds(phaseDiffSecs)

    }, 1000)

    return () => clearInterval(timer)
  }, [run])

  // Sync edit plan with fetched plan when it lands
  useEffect(() => {
    if (run?.plan?.tests && !editingPlanTests) {
      setEditingPlanTests(JSON.parse(JSON.stringify(run.plan.tests)))
    }
  }, [run?.plan])

  async function fetchRunDetails(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const res = await fetch(`/api/agent/runs/${params.agentRunId}`)
      if (res.ok) {
        const data = await res.json()
        setRun(data.agentRun)
      }

      const statusRes = await fetch(`/api/projects/${params.id}/agent/status`)
      if (statusRes.ok) {
        const data = await statusRes.json()
        setWorkerOnline(data.workerOnline)
      }
    } catch (err) {
      console.error("Failed to sync run details:", err)
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  async function handleApprovePlan() {
    setApproving(true)
    try {
      const res = await fetch(`/api/agent/runs/${params.agentRunId}/approve-plan`, {
        method: "POST"
      })
      if (res.ok) {
        fetchRunDetails(true)
      } else {
        alert("Failed to approve plan")
      }
    } catch {
      alert("Error approving plan")
    } finally {
      setApproving(false)
    }
  }

  async function handleConfirmCancel() {
    const res = await fetch(`/api/agent/runs/${params.agentRunId}/cancel`, {
      method: "POST"
    })
    if (res.ok) {
      setShowCancelModal(false)
      fetchRunDetails(true)
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || "Failed to cancel run")
    }
  }

  async function executeForceStop() {
    const res = await fetch(`/api/agent/runs/${params.agentRunId}/force-stop`, {
      method: "POST"
    })
    if (res.ok) {
      setShowForceStopModal(false)
      fetchRunDetails(true)
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || "Failed to force stop")
    }
  }

  async function handleCreateBug(findingId: string) {
    try {
      const res = await fetch(`/api/agent/runs/${params.agentRunId}/create-bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId })
      })
      if (res.ok) {
        alert("Bug report created successfully!")
        fetchRunDetails(false)
      } else {
        alert("Failed to create bug report")
      }
    } catch {
      alert("Error generating bug")
    }
  }

  async function handleSaveAsTestCases() {
    if (!run?.plan?.tests) return
    setSavingTests(true)
    try {
      const testNames = run.plan.tests.map((t: any) => t.name)
      const res = await fetch(`/api/agent/runs/${params.agentRunId}/save-as-test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTestNames: testNames })
      })

      if (res.ok) {
        const data = await res.json()
        const { created, duplicated, skipped } = data.summary
        alert(`Plan saved as test cases!\nCreated: ${created}\nDuplicates Skipped: ${duplicated}\nIgnored: ${skipped}`)
      } else {
        alert("Failed to save plan as test cases")
      }
    } catch {
      alert("Error saving test cases")
    } finally {
      setSavingTests(false)
    }
  }

  function handleRemoveTestFromPlan(index: number) {
    if (!editingPlanTests) return
    const updated = [...editingPlanTests]
    updated.splice(index, 1)
    setEditingPlanTests(updated)
  }

  function getWhatIsHappeningMessage(status: string, currentPhase: string | null) {
    const phase = currentPhase || status
    switch (phase) {
      case "Queued":
        return "The run has been created and queued. Waiting for the worker to pick it up."
      case "Analyzing":
      case "Scanning":
      case "ScanningPage":
      case "LaunchingBrowser":
      case "OpeningTargetUrl":
      case "WorkerStarted":
        return "The agent is opening the target URL and scanning the page DOM."
      case "Planning":
      case "Generating":
      case "PlanningTests":
        return "The agent is formulating and generating test scenarios from detected UI components."
      case "WaitingForApproval":
        return "Waiting for user review and approval of the generated plan."
      case "Running":
      case "Testing":
      case "ExecutingTests":
        return "The agent is executing generated tests using Playwright."
      case "Reporting":
      case "Summarizing":
      case "GeneratingReport":
        return "The agent is generating the QA summary report."
      case "Completed":
        return "The QA Agent run completed successfully."
      case "Failed":
        return "The QA Agent run failed. Check the error details below."
      case "Cancelled":
        return "The QA Agent run was cancelled."
      default:
        return "Waiting for the agent worker to pick up this job."
    }
  }

  if (loading && !run) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-650" />
        <p className="text-sm text-muted-foreground font-semibold">Syncing live worker telemetry stream...</p>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive font-bold text-lg">QA Agent session not found</p>
        <Link href={`/projects/${params.id}/agent`} className="text-indigo-600 hover:underline mt-2 inline-block">Back to settings</Link>
      </div>
    )
  }

  const stages = ["Queued", "Scanning", "Planning", "WaitingForApproval", "Running", "Reporting", "Completed"]
  const currentStageIndex = stages.indexOf(run.status === "Failed" ? "Completed" : run.status === "Cancelled" ? "Completed" : run.status)

  const passedCount = run.steps.filter(s => s.status === "Passed").length
  const failedCount = run.steps.filter(s => s.status === "Failed").length
  const healedCount = run.steps.filter(s => s.status === "SelfHealed").length
  const skippedCount = run.steps.filter(s => s.status === "Skipped").length

  const detectingLoginEntryStep = run.steps.find(s => s.name === "DetectingLoginEntry")
  const detectingLoginFormStep = run.steps.find(s => s.name === "DetectingLoginForm")
  const verifyingLoginStep = run.steps.find(s => s.name === "VerifyingLogin")

  const loginEntryPointFound = detectingLoginEntryStep
    ? (detectingLoginEntryStep.status === "Completed" ? "Found" : detectingLoginEntryStep.status === "Failed" ? "Not Found" : "Not Scanned")
    : "Not Scanned"

  const loginFormFound = detectingLoginFormStep
    ? (detectingLoginFormStep.status === "Completed" ? "Found" : detectingLoginFormStep.status === "Failed" ? "Not Found" : "Not Scanned")
    : "Not Scanned"

  const usernameFieldFound = detectingLoginFormStep
    ? (detectingLoginFormStep.details?.usernameFieldFound ?? (detectingLoginFormStep.status === "Completed" ? "Found" : "Not Found"))
    : "Not Scanned"

  const passwordFieldFound = detectingLoginFormStep
    ? (detectingLoginFormStep.details?.passwordFieldFound ?? (detectingLoginFormStep.status === "Completed" ? "Found" : "Not Found"))
    : "Not Scanned"

  const submitButtonFound = detectingLoginFormStep
    ? (detectingLoginFormStep.details?.submitButtonFound ?? (detectingLoginFormStep.status === "Completed" ? "Found" : "Not Found"))
    : "Not Scanned"

  const loginResult = verifyingLoginStep
    ? (verifyingLoginStep.details?.loginResult ?? (verifyingLoginStep.status === "Completed" ? "Passed" : verifyingLoginStep.status === "Failed" ? "Failed" : "Uncertain"))
    : "Not Scanned"

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${params.id}/agent`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-50">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-50">Agent Telemetry Dashboard</h1>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Session ID: <span className="font-mono text-slate-800 dark:text-slate-250 font-bold">{run.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!["Completed", "Failed", "Cancelled"].includes(run.status) && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-955/10 border border-indigo-100/50 dark:border-indigo-900/50 text-xs font-bold text-indigo-650 dark:text-indigo-400 animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Live Updates Streaming
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowCancelModal(true)} disabled={cancelling} className="h-9 rounded-xl text-xs font-semibold">
                Cancel Run
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowForceStopModal(true)} disabled={forceStopping} className="h-9 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white">
                Force Stop
              </Button>
            </>
          )}
          {["Completed", "Failed", "Cancelled"].includes(run.status) && (
            <Button variant="outline" size="sm" onClick={() => fetchRunDetails(true)} className="h-9 rounded-xl text-xs font-semibold">
              Force Reload
            </Button>
          )}
        </div>
      </div>

      {/* Observability Warnings */}
      {/* 30s Queued Warning */}
      {run.status === "Queued" && queuedSeconds > 30 && queuedSeconds <= 120 && (
        <div className="p-4 border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-955/10 rounded-2xl text-xs font-semibold text-amber-700 dark:text-amber-450 flex items-start gap-2.5 shadow-sm animate-in fade-in">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-550 shrink-0" />
          <div>
            <span className="font-bold">Still waiting for worker...</span> This usually means the worker is not running or the queue is not being processed.
          </div>
        </div>
      )}

      {/* 2m Queued Warning */}
      {run.status === "Queued" && queuedSeconds > 120 && (
        <div className="p-4 border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-955/10 rounded-2xl text-xs font-semibold text-rose-700 dark:text-rose-455 flex flex-col gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4.5 w-4.5 text-rose-550 shrink-0" />
            <div>
              <span className="font-bold">Agent worker did not pick up this run within 2 minutes.</span> Please start the worker: <code className="bg-rose-100 dark:bg-rose-950 px-1 py-0.5 rounded font-mono font-bold">npm run worker</code>
            </div>
          </div>
          <div className="flex gap-2 pl-7">
            <Button onClick={() => fetchRunDetails(false)} size="sm" variant="outline" className="h-7 text-[10px] rounded-lg border-rose-350 dark:border-rose-800 text-rose-850 dark:text-rose-400 bg-white dark:bg-slate-900">
              Retry Worker Check
            </Button>
            <Button onClick={() => setShowCancelModal(true)} size="sm" variant="outline" className="h-7 text-[10px] rounded-lg border-rose-350 dark:border-rose-800 text-rose-850 dark:text-rose-400 bg-white dark:bg-slate-900">
              Cancel Run
            </Button>
            <Button onClick={() => setShowForceStopModal(true)} size="sm" variant="destructive" className="h-7 text-[10px] rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold">
              Force Stop
            </Button>
          </div>
        </div>
      )}

      {/* Phase Slow Warnings */}
      {["Analyzing", "Scanning", "ScanningPage", "LaunchingBrowser", "OpeningTargetUrl", "WorkerStarted"].includes(run.currentPhase || run.status) && phaseSeconds > 60 && (
        <div className="p-4 border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-955/10 rounded-2xl text-xs font-semibold text-amber-700 dark:text-amber-450 flex items-start gap-2.5 shadow-sm animate-in fade-in">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-550 shrink-0" />
          <div>
            <span className="font-bold">This phase is taking longer than expected.</span> Browser launch or target URL DOM analysis is taking over 60 seconds.
          </div>
        </div>
      )}

      {["Planning", "Generating", "PlanningTests"].includes(run.currentPhase || run.status) && phaseSeconds > 30 && (
        <div className="p-4 border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-955/10 rounded-2xl text-xs font-semibold text-amber-700 dark:text-amber-450 flex items-start gap-2.5 shadow-sm animate-in fade-in">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-550 shrink-0" />
          <div>
            <span className="font-bold">This phase is taking longer than expected.</span> Creating test scenarios from page analysis usually finishes in under 30 seconds.
          </div>
        </div>
      )}

      {/* Stuck 5-minute Warning */}
      {!["Completed", "Failed", "Cancelled"].includes(run.status) && phaseSeconds > 300 && (
        <div className="p-4 border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-955/10 rounded-2xl text-xs font-semibold text-rose-700 dark:text-rose-455 flex flex-col gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4.5 w-4.5 text-rose-550 shrink-0" />
            <div>
              <span className="font-bold">This run appears stuck.</span> The active step has been running in the same phase for over 5 minutes.
            </div>
          </div>
          <div className="flex gap-2 pl-7">
            <Button onClick={() => setShowCancelModal(true)} size="sm" variant="outline" className="h-7 text-[10px] rounded-lg">
              Cancel Run
            </Button>
            <Button onClick={() => setShowForceStopModal(true)} size="sm" variant="destructive" className="h-7 text-[10px] rounded-lg text-white font-bold bg-rose-600 hover:bg-rose-700">
              Force Stop
            </Button>
          </div>
        </div>
      )}

      {/* Top Card: Overall Progress and Observability */}
      <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-slate-50 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600 animate-pulse" /> Overall Progress: {run.progress || 5}%
            </h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Phase: <span className="text-slate-800 dark:text-slate-200 font-bold">{run.currentPhase || run.status}</span>
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1 text-xs">
            <div className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{liveTimers.elapsedStr}</div>
            <div className="text-slate-400 text-[11px] font-bold">Phase time: {liveTimers.phaseElapsedStr}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
            <div
              className="bg-gradient-to-r from-indigo-600 to-violet-600 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${run.progress || 5}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-450 font-black uppercase tracking-wider">
            <span>Started</span>
            <span>{run.currentPhase || run.status} ({run.progress || 5}%)</span>
            <span>Completed</span>
          </div>
        </div>

        {/* What is happening now? Panel */}
        <div className="p-4 bg-indigo-50/20 dark:bg-indigo-955/5 border border-indigo-150 dark:border-indigo-900/40 rounded-xl space-y-1">
          <h4 className="text-xs font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">What is happening now?</h4>
          <p className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed font-semibold">
            {getWhatIsHappeningMessage(run.status, run.currentPhase)}
          </p>
        </div>

        {/* Heartbeat Status */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 pt-1">
          <span className="text-slate-450 uppercase text-[10px] font-black tracking-wider">Worker Heartbeat:</span>
          <span className={`px-2.5 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider ${
            run.workerHealth?.status === "Healthy" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20 dark:text-emerald-450" :
            run.workerHealth?.status === "Warning" ? "bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-450" :
            "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-455"
          }`}>
            {run.workerHealth?.status || "Waiting for worker"}
          </span>
          {run.workerHealth && run.workerHealth.secondsSinceHeartbeat !== null && (
            <span className="text-slate-400 text-[10px] font-medium">({run.workerHealth.secondsSinceHeartbeat}s ago)</span>
          )}
        </div>

        {/* Session Context Metadata Grid */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 pt-4 border-t border-dashed text-xs">
          <div>
            <span className="text-slate-450 block font-black uppercase text-[10px] tracking-wider mb-1">Target URL</span>
            <span className="font-semibold text-slate-705 dark:text-slate-200 flex items-center gap-1.5">
              <span className="truncate max-w-[200px]" title={run.scope?.targetUrl || run.project.webAppUrl}>
                {run.scope?.targetUrl || run.project.webAppUrl}
              </span>
              <a href={run.scope?.targetUrl || run.project.webAppUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-855 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </span>
          </div>
          <div>
            <span className="text-slate-455 block font-black uppercase text-[10px] tracking-wider mb-1">Credential / Role</span>
            <span className="font-bold text-slate-800 dark:text-slate-205">
              {run.credentialRole ? `Role: ${run.credentialRole}` : "Public Scan (No Login)"}
            </span>
          </div>
          <div>
            <span className="text-slate-455 block font-black uppercase text-[10px] tracking-wider mb-1">Goal</span>
            <span className="font-semibold text-slate-705 dark:text-slate-350">{run.goal}</span>
          </div>
          <div>
            <span className="text-slate-455 block font-black uppercase text-[10px] tracking-wider mb-1">Environment</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-slate-105 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {run.scope?.environment || "Development"}
            </span>
          </div>
        </div>
      </div>

      {/* Login Flow Verification Card */}
      <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
        <h3 className="text-xs font-black uppercase text-slate-405 tracking-wider border-b pb-2">Login Flow Verification</h3>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-6">
          <div className="p-4 rounded-xl border bg-slate-50/20 dark:bg-slate-900/50">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Login Entry Point</span>
            <div className={`text-sm font-black mt-1 ${loginEntryPointFound === "Found" ? "text-emerald-600" : loginEntryPointFound === "Not Found" ? "text-rose-600" : "text-slate-400"}`}>
              {loginEntryPointFound}
            </div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/20 dark:bg-slate-900/50">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Login Form</span>
            <div className={`text-sm font-black mt-1 ${loginFormFound === "Found" ? "text-emerald-600" : loginFormFound === "Not Found" ? "text-rose-600" : "text-slate-400"}`}>
              {loginFormFound}
            </div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/20 dark:bg-slate-900/50">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Username Field</span>
            <div className={`text-sm font-black mt-1 ${usernameFieldFound === "Found" || usernameFieldFound === true ? "text-emerald-600" : usernameFieldFound === "Not Found" || usernameFieldFound === false ? "text-rose-600" : "text-slate-400"}`}>
              {usernameFieldFound === true ? "Found" : usernameFieldFound === false ? "Not Found" : usernameFieldFound}
            </div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/20 dark:bg-slate-900/50">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Password Field</span>
            <div className={`text-sm font-black mt-1 ${passwordFieldFound === "Found" || passwordFieldFound === true ? "text-emerald-600" : passwordFieldFound === "Not Found" || passwordFieldFound === false ? "text-rose-600" : "text-slate-400"}`}>
              {passwordFieldFound === true ? "Found" : passwordFieldFound === false ? "Not Found" : passwordFieldFound}
            </div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/20 dark:bg-slate-900/50">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Submit Button</span>
            <div className={`text-sm font-black mt-1 ${submitButtonFound === "Found" || submitButtonFound === true ? "text-emerald-600" : submitButtonFound === "Not Found" || submitButtonFound === false ? "text-rose-600" : "text-slate-400"}`}>
              {submitButtonFound === true ? "Found" : submitButtonFound === false ? "Not Found" : submitButtonFound}
            </div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/20 dark:bg-slate-900/50">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Login Result</span>
            <div className={`text-sm font-black mt-1 ${loginResult === "Passed" ? "text-emerald-600" : loginResult === "Failed" ? "text-rose-600" : loginResult === "Uncertain" ? "text-amber-600" : "text-slate-400"}`}>
              {loginResult}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Tracker */}
      <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-5">Agent Execution Progress</h3>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 md:gap-2">
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex || run.status === "Completed"
            const isActive = idx === currentStageIndex
            const labelMap: Record<string, string> = {
              Queued: "Enqueuing",
              Scanning: "Scanning DOM",
              Planning: "Creating Plan",
              WaitingForApproval: "Review Plan",
              Running: "Running Steps",
              Reporting: "Summaries",
              Completed: run.status === "Failed" ? "Failed Run" : run.status === "Cancelled" ? "Cancelled" : "Complete"
            }

            return (
              <div key={stage} className="flex flex-col items-center md:items-start text-center md:text-left space-y-2 p-3 rounded-xl border border-transparent hover:bg-slate-50/40 dark:hover:bg-slate-850/40 transition-colors">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-sm border shadow-sm transition-all ${
                  isCompleted ? "bg-emerald-500 border-emerald-500 text-white" :
                  isActive ? "bg-indigo-600 border-indigo-600 text-white scale-105 animate-pulse animate-duration-1000" :
                  "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-4.5 w-4.5" /> : idx + 1}
                </div>
                <div>
                  <h4 className={`text-[11px] font-black ${isActive ? "text-indigo-650 dark:text-indigo-400" : isCompleted ? "text-emerald-600 dark:text-emerald-450" : "text-slate-400"}`}>
                    {labelMap[stage]}
                  </h4>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Diagnostics & Live Activity Feed */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Queue Diagnostics */}
        <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
          <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider pb-2 border-b">Queue Diagnostics</h3>
          {run.queueDiagnostics ? (
            <div className="grid gap-3.5 grid-cols-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div>
                <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider mb-0.5">Queue Name</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{run.queueDiagnostics.queueName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider mb-0.5">Job ID</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 truncate block max-w-[150px]" title={run.queueDiagnostics.jobId || "None"}>
                  {run.queueDiagnostics.jobId || "No queue job ID found"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider mb-0.5">Job State</span>
                <span className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase font-bold ${
                  run.queueDiagnostics.jobState === "active" ? "bg-indigo-50 text-indigo-755 dark:bg-indigo-950/20 dark:text-indigo-400" :
                  run.queueDiagnostics.jobState === "waiting" ? "bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400 animate-pulse" :
                  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}>
                  {run.queueDiagnostics.jobState}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider mb-0.5">Worker Status</span>
                <span className={`font-bold ${run.queueDiagnostics.workerOnline ? "text-emerald-650" : "text-rose-650"}`}>
                  {run.queueDiagnostics.workerOnline ? "Online" : "Offline / Unknown"}
                </span>
              </div>
              <div className="col-span-2 pt-2.5 border-t grid grid-cols-3 gap-2.5 text-center text-[10px]">
                <div className="bg-slate-50 dark:bg-slate-850 p-2 rounded-xl">
                  <span className="text-slate-400 block font-bold mb-0.5">Waiting</span>
                  <span className="text-slate-850 dark:text-slate-250 font-extrabold text-sm">{run.queueDiagnostics.waitingJobs}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-850 p-2 rounded-xl">
                  <span className="text-slate-400 block font-bold mb-0.5">Active</span>
                  <span className="text-slate-850 dark:text-slate-250 font-extrabold text-sm">{run.queueDiagnostics.activeJobs}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-850 p-2 rounded-xl">
                  <span className="text-slate-400 block font-bold mb-0.5">Failed</span>
                  <span className="text-slate-850 dark:text-slate-250 font-extrabold text-sm">{run.queueDiagnostics.failedJobs}</span>
                </div>
              </div>
              {run.queueDiagnostics.jobState === "waiting" && run.status === "Queued" && (
                <div className="col-span-2 p-2.5 bg-amber-50/50 dark:bg-amber-955/5 border border-amber-200/50 dark:border-amber-900/55 rounded-xl text-[10px] text-amber-800 dark:text-amber-400 leading-normal font-medium">
                  <strong>Status:</strong> Job is waiting in queue. Worker has not picked it up yet.
                </div>
              )}
              {!run.queueDiagnostics.jobId && (
                <div className="col-span-2 p-2.5 bg-rose-50/50 dark:bg-rose-955/5 border border-rose-200/50 dark:border-rose-900/55 rounded-xl text-[10px] text-rose-800 dark:text-rose-455 leading-normal font-medium">
                  <strong>Critical Error:</strong> No queue job ID found. The run was created but not added to queue correctly.
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-xs italic">Loading diagnostics...</p>
          )}
        </div>

        {/* Live Activity Feed */}
        <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
          <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider pb-2 border-b">Live Activity Feed</h3>
          {(!run.events || run.events.length === 0) ? (
            <div className="text-slate-450 italic text-xs py-4">Waiting for activity logs...</div>
          ) : (
            <div className="space-y-3.5 max-h-[175px] overflow-y-auto pr-1">
              {run.events.map((evt) => (
                <div key={evt.id} className="flex items-start gap-2.5 text-xs leading-normal animate-in fade-in duration-300">
                  <span className="font-mono text-[10px] text-slate-450 shrink-0 bg-slate-50 dark:bg-slate-850 px-1.5 py-0.5 rounded select-none">
                    {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString() : ""}
                  </span>
                  <div className="flex-1">
                    <span className="text-slate-700 dark:text-slate-300 font-semibold">{evt.message}</span>
                    {evt.phase && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-indigo-50 text-indigo-650 dark:bg-indigo-950/20 dark:text-indigo-400">
                        {evt.phase}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mini telemetry dashboard */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-6">
        <div className="p-4 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Duration</span>
          <h4 className="text-sm font-black mt-1 text-slate-800 dark:text-slate-100">
            {run.status === "Queued" ? "Waiting..." :
             ["Scanning", "Planning", "Running", "Reporting", "WaitingForApproval"].includes(run.status) ? "Running..." :
             `${(run.durationMs / 1000).toFixed(1)}s`}
          </h4>
        </div>
        <div className="p-4 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Metrics</span>
          <h4 className="text-sm font-black mt-1 text-slate-850 dark:text-slate-100">
            {run.status === "Queued" ? "Pending" : `Passed: ${passedCount} | Failed: ${failedCount}`}
          </h4>
        </div>
        <div className="p-4 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Passed Steps</span>
          <h4 className="text-xl font-black mt-1 text-slate-850 dark:text-slate-100">{passedCount}</h4>
        </div>
        <div className="p-4 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Self-Healed</span>
          <h4 className="text-xl font-black mt-1 text-amber-600">{healedCount}</h4>
        </div>
        <div className="p-4 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Failed Steps</span>
          <h4 className="text-xl font-black mt-1 text-rose-600">{failedCount}</h4>
        </div>
        <div className="p-4 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Safety Skipped</span>
          <h4 className="text-xl font-black mt-1 text-slate-500">{skippedCount}</h4>
        </div>
      </div>

      {/* Semi-Autonomous plan approval UI */}
      {run.status === "WaitingForApproval" && editingPlanTests && (
        <div className="p-6 border border-purple-150 dark:border-purple-955 rounded-2xl bg-purple-50/10 dark:bg-purple-955/5 shadow-md space-y-4">
          <div className="flex justify-between items-center border-b pb-3.5">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Review and Approve Suggested Plan</h3>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleApprovePlan} disabled={approving} className="bg-purple-650 hover:bg-purple-750 text-white font-bold rounded-xl text-xs h-8">
                {approving ? "Enqueuing Execution..." : "Approve and Run Plan"}
              </Button>
            </div>
          </div>
          <div className="space-y-3.5">
            {editingPlanTests.map((t, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-background flex justify-between items-start">
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {t.name}
                    <span className="px-2 py-0.5 rounded bg-slate-50 font-black text-[9px] uppercase">{t.priority}</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">Steps planned: {t.steps.length}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => handleRemoveTestFromPlan(idx)} className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl">
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spawned E2E Executions Accordion list */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-slate-400" /> Spawned E2E Executions
        </h3>

        {run.steps.length === 0 ? (
          <div className="text-center border rounded-2xl py-8 bg-slate-50/40 dark:bg-slate-900">
            <p className="text-xs text-slate-400 italic">No steps executed yet. Active updates will render here.</p>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-md">
            <div className="p-4 bg-slate-50 dark:bg-slate-850 font-bold text-xs text-slate-500 border-b">
              Step Results Log ({run.steps.length} steps)
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {run.steps.map((step) => (
                <div key={step.id} className="p-4 space-y-3 hover:bg-slate-50/30 dark:hover:bg-slate-850/20 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-start gap-2.5 text-xs">
                      <span className="font-bold text-slate-450 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded select-none shrink-0">
                        Step {step.stepNumber}
                      </span>
                      <div>
                        <p className="font-bold text-slate-850 dark:text-slate-100">{step.name}</p>
                        {step.details?.expected && (
                          <p className="text-[10px] text-slate-400 font-semibold mt-1">Expected: {step.details.expected}</p>
                        )}
                        {step.details?.resolvedSelector && (
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5">Locator: {step.details.resolvedSelector}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                      step.status === "Passed" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                      step.status === "Failed" ? "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-455" :
                      step.status === "SelfHealed" ? "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400" :
                      step.status === "Skipped" ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" :
                      "bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 animate-pulse"
                    }`}>
                      {step.status === "SelfHealed" ? "Self Healed" : step.status}
                    </span>
                  </div>

                  {step.status === "SelfHealed" && step.details?.healingLogs && (
                    <div className="p-3 bg-amber-50/50 dark:bg-amber-955/10 border border-amber-200/50 dark:border-amber-900/50 rounded-xl space-y-1 animate-in fade-in">
                      <div className="flex items-center gap-1 text-[11px] font-black text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5 fill-amber-100 text-amber-600" />
                        Self-Healing Recovery Logs
                      </div>
                      <p className="text-[10px] text-amber-800 dark:text-amber-400 leading-normal whitespace-pre-line font-mono">
                        {step.details.healingLogs}
                      </p>
                    </div>
                  )}

                  {step.status === "Skipped" && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 animate-in fade-in">
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500">
                        <ShieldAlert className="h-3.5 w-3.5 text-slate-450" />
                        Safety Sandbox Intercepted Action
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-normal">
                        {step.error || "This action was skipped under current safety filter rules to protect the database."}
                      </p>
                    </div>
                  )}

                  {step.error && step.status === "Failed" && (
                    <div className="p-3 bg-rose-50/40 dark:bg-rose-955/10 border border-rose-200/50 dark:border-rose-900/50 rounded-xl animate-in fade-in">
                      <p className="text-[10px] text-rose-700 dark:text-rose-455 font-mono leading-normal whitespace-pre-line">
                        {step.error}
                      </p>
                    </div>
                  )}

                  {step.screenshotPath && (
                    <div className="pt-2">
                      <span className="text-[9px] uppercase font-black text-slate-400 block mb-1">Step Screenshot</span>
                      <a href={step.screenshotPath} target="_blank" rel="noreferrer" className="block max-w-sm rounded-lg overflow-hidden border border-slate-100 hover:border-slate-350 transition-colors">
                        <img src={step.screenshotPath} alt={`Step ${step.stepNumber}`} className="w-full object-cover max-h-48" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grid of Auto-Generated Findings */}
      {run.findings && run.findings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <Bug className="h-5 w-5 text-red-500" /> Auto-Generated Bug Findings
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {run.findings.map((f) => (
              <div
                key={f.id}
                className="p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">{f.title}</h4>
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                    f.severity === "Critical" ? "bg-red-150 text-red-700" :
                    f.severity === "High" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-650"
                  }`}>{f.severity}</span>
                </div>
                <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">{f.description}</p>
                {f.evidence?.error && (
                  <div className="p-2 bg-slate-50 dark:bg-slate-850 text-[10px] font-mono rounded text-rose-650 overflow-x-auto max-h-24">
                    {f.evidence.error}
                  </div>
                )}
                <div className="pt-3 border-t border-dashed flex justify-between items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">{f.type}</span>
                  {f.bugReportId ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-650 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                      <Check className="h-3 w-3" /> Defect Filed
                    </span>
                  ) : (
                    <Button size="sm" onClick={() => handleCreateBug(f.id)} className="h-7 px-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold border border-rose-200">
                      <Bug className="h-3 w-3 mr-1" /> Create Bug
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Run Summary Report */}
      {run.status === "Completed" && (
        <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3.5">
            <h3 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-500 animate-pulse" /> Agent Sweep Results Report Summary
            </h3>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveAsTestCases} disabled={savingTests} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs h-8">
                <Save className="h-3.5 w-3.5 mr-1" /> Save Plan as Test Cases
              </Button>
            </div>
          </div>

          <div className="p-4 bg-slate-50/20 dark:bg-slate-955/10 rounded-xl space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-350">Recommendations & Next Actions:</div>
            <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed whitespace-pre-line font-semibold">
              {run.summary?.markdownSummary || "Sweep completed successfully. No immediate critical bugs triggered."}
            </p>
          </div>
        </div>
      )}

      {/* Stop Agent Run Modal */}
      <ConfirmDialog
        open={showCancelModal}
        title="Cancel Agent Run?"
        description="This will stop the queued or running autonomous QA agent run. Partial logs, screenshots, and findings will be kept."
        confirmLabel="Confirm Cancel Run"
        cancelLabel="Keep Running"
        variant="warning"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />

      {/* Force Stop Modal */}
      <ConfirmDialog
        open={showForceStopModal}
        title="Force Stop Run?"
        description="Use this only if the run is stuck and cannot be cancelled normally. This is a destructive action."
        confirmLabel="Force Stop"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={executeForceStop}
        onCancel={() => setShowForceStopModal(false)}
      />
    </div>
  )
}
