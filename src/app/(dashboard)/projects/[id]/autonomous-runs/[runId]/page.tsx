"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  ChevronLeft,
  RefreshCw,
  Activity,
  Zap,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Map,
  Code,
  LayoutGrid,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  Play
} from "lucide-react"

interface TestCase {
  title: string
}

interface StepResult {
  id: string
  stepNumber: number
  actionDescription: string
  expectedResult: string
  actualResult: string | null
  status: "Passed" | "Failed" | "SelfHealed" | "Skipped" | "Pending"
  errorDetails: string | null
  notes: string | null
}

interface TestRun {
  id: string
  status: string
  browserType: string
  viewport: string
  testCase: TestCase
  stepResults: StepResult[]
}

interface BugReport {
  id: string
  title: string
  severity: string
  priority: string
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
}

interface AutonomousAgentRun {
  id: string
  status: "Queued" | "Analyzing" | "Generating" | "Executing" | "Reporting" | "Completed" | "Failed" | "Cancelled"
  mode: "Fast" | "Balanced" | "Full"
  safetyDoNotDelete: boolean
  safetyDoNotModify: boolean
  summary: string | null
  coverageReport: {
    scannedRoutes?: string[]
    discoveredElements?: Array<{
      tagName: string
      text?: string
      placeholder?: string
      label?: string
      name?: string
      testid?: string
    }>
  } | null
  metrics: {
    passCount?: number
    failCount?: number
    selfHealedCount?: number
    bugCount?: number
    totalDurationMs?: number
  } | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  testRuns: TestRun[]
  bugReports: BugReport[]
}

export default function AutonomousTelemetryDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [run, setRun] = useState<AutonomousAgentRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})

  // Polling logic when run is active
  useEffect(() => {
    fetchRunDetails()

    let intervalId: any
    // Only poll if status is a running/active state
    const isFinished = ["Completed", "Failed", "Cancelled"].includes(run?.status || "")
    if (!isFinished) {
      intervalId = setInterval(() => {
        fetchRunDetails(false)
      }, 2500)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [params.id, params.runId, run?.status])

  async function fetchRunDetails(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/autonomous-runs/${params.runId}`)
      if (res.ok) {
        const data = await res.json()
        setRun(data.agentRun)
      } else {
        console.error("Failed to fetch run details")
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  function toggleRunExpand(runId: string) {
    setExpandedRuns((prev) => ({
      ...prev,
      [runId]: !prev[runId]
    }))
  }

  if (loading && !run) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-650" />
        <p className="text-sm text-muted-foreground font-semibold">Loading live telemetry stream...</p>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive font-bold text-lg">Autonomous run not found</p>
        <Link href={`/projects/${params.id}/autonomous-runs`} className="text-indigo-600 hover:underline mt-2 inline-block">Back to runs list</Link>
      </div>
    )
  }

  // Calculate current active phase
  const phases = ["Queued", "Analyzing", "Generating", "Executing", "Reporting", "Completed"]
  const currentPhaseIndex = phases.indexOf(run.status === "Failed" ? "Completed" : run.status === "Cancelled" ? "Completed" : run.status)

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Back & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${params.id}/autonomous-runs`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-50">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Telemetry Dashboard</h1>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Session ID: <span className="font-mono text-slate-800 dark:text-slate-250 font-bold">{run.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {["Queued", "Analyzing", "Generating", "Executing", "Reporting"].includes(run.status) && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/50 text-xs font-bold text-indigo-650 dark:text-indigo-400">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Live Updates Streaming
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchRunDetails(true)} className="h-9 rounded-xl text-xs font-semibold">
            Force Reload
          </Button>
        </div>
      </div>

      {/* 1. Live Agent Phase Tracker */}
      <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md">
        <h3 className="text-sm font-black uppercase text-slate-400 tracking-wider mb-5">Agent Execution Progress Timeline</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 md:gap-2">
          {phases.map((phase, idx) => {
            const isCompleted = idx < currentPhaseIndex || run.status === "Completed"
            const isActive = idx === currentPhaseIndex
            const isPending = idx > currentPhaseIndex && run.status !== "Completed"

            return (
              <div key={phase} className="relative flex flex-col items-center md:items-start text-center md:text-left space-y-2 p-3 rounded-xl border border-transparent hover:bg-slate-50/40 dark:hover:bg-slate-850/40 transition-colors">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-sm border shadow-sm transition-all ${
                  isCompleted ? "bg-emerald-500 border-emerald-500 text-white shadow-emerald-500/10" :
                  isActive ? "bg-indigo-600 border-indigo-600 text-white shadow-indigo-600/10 scale-105 animate-pulse" :
                  "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-4.5 w-4.5" /> : idx + 1}
                </div>
                <div>
                  <h4 className={`text-xs font-black ${isActive ? "text-indigo-650 dark:text-indigo-400" : isCompleted ? "text-emerald-600 dark:text-emerald-450" : "text-slate-400"}`}>
                    {phase === "Completed" && run.status === "Failed" ? "Failed" : phase}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                    {phase === "Queued" && "Awaiting processing"}
                    {phase === "Analyzing" && "Scraping page DOM"}
                    {phase === "Generating" && "Formulating scenarios"}
                    {phase === "Executing" && "Running Playwright"}
                    {phase === "Reporting" && "Writing QA Summary"}
                    {phase === "Completed" && (run.status === "Failed" ? "Errored during run" : "QA sweep complete")}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. Discovered Coverage Matrix & Elements */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Scanned Routes List */}
        <div className="md:col-span-1 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b pb-3">
            <Map className="h-5 w-5 text-indigo-500" /> Scanned Paths Mapping
          </h3>
          {run.coverageReport?.scannedRoutes && run.coverageReport.scannedRoutes.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {run.coverageReport.scannedRoutes.map((route, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 text-xs font-semibold"
                >
                  <span className="truncate text-slate-700 dark:text-slate-350" title={route}>
                    {route}
                  </span>
                  <a href={route} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-600 ml-2">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No routes mapped yet. Waiting for Analyzing stage.</p>
          )}
        </div>

        {/* DOM Interactive Elements List */}
        <div className="md:col-span-2 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b pb-3">
            <Code className="h-5 w-5 text-purple-500" /> Interactive DOM Components
          </h3>
          {run.coverageReport?.discoveredElements && run.coverageReport.discoveredElements.length > 0 ? (
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 max-h-72 overflow-y-auto pr-1">
              {run.coverageReport.discoveredElements.map((el, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 space-y-1.5 text-xs"
                >
                  <div className="flex justify-between items-center">
                    <span className="px-2 py-0.5 rounded font-black text-[9px] uppercase bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
                      {el.tagName}
                    </span>
                    {el.testid && (
                      <span className="font-mono text-[9px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">
                        {el.testid}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {el.text && (
                      <p className="text-slate-700 dark:text-slate-300 font-semibold line-clamp-1">
                        Text: <span className="italic font-normal">&quot;{el.text}&quot;</span>
                      </p>
                    )}
                    {el.placeholder && (
                      <p className="text-slate-500 text-[10px]">
                        Placeholder: <span className="italic">{el.placeholder}</span>
                      </p>
                    )}
                    {el.name && (
                      <p className="text-slate-400 text-[9px] font-mono">
                        Name/ID: {el.name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No interactive inputs captured yet. Waiting for Analyzing stage.</p>
          )}
        </div>
      </div>

      {/* 3. Executed Test Runs (Accordion List) */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-slate-400" /> Spawned E2E Executions
        </h3>

        {run.testRuns.length === 0 ? (
          <div className="text-center border rounded-2xl py-8 bg-slate-50/40 dark:bg-slate-900">
            <p className="text-xs text-slate-400 italic">No test cases generated or executed yet. Pending Generator step.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {run.testRuns.map((testRun) => {
              const isExpanded = expandedRuns[testRun.id]
              const passedSteps = testRun.stepResults.filter((s) => s.status === "Passed").length
              const healedSteps = testRun.stepResults.filter((s) => s.status === "SelfHealed").length
              const skippedSteps = testRun.stepResults.filter((s) => s.status === "Skipped").length
              const totalSteps = testRun.stepResults.length

              return (
                <div
                  key={testRun.id}
                  className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all"
                >
                  {/* Collapsible Header */}
                  <div
                    onClick={() => toggleRunExpand(testRun.id)}
                    className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850/40 select-none border-b border-transparent data-[expanded=true]:border-slate-100 dark:data-[expanded=true]:border-slate-800"
                    data-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="text-slate-400 hover:text-slate-600 transition-colors">
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-55 flex items-center gap-2">
                          {testRun.testCase.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-slate-400">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{testRun.id.substring(0, 8)}</span>
                          <span>•</span>
                          <span>Browser: {testRun.browserType} ({testRun.viewport})</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Step counters */}
                      <div className="text-xs text-slate-500 font-semibold bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
                        Steps: <strong className="text-slate-800 dark:text-slate-100">{passedSteps + healedSteps}/{totalSteps}</strong>
                        {healedSteps > 0 && (
                          <span className="text-amber-600 ml-1.5">({healedSteps} healed)</span>
                        )}
                        {skippedSteps > 0 && (
                          <span className="text-slate-400 ml-1.5">({skippedSteps} skipped)</span>
                        )}
                      </div>

                      {/* Status badge */}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ${
                        testRun.status === "Passed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
                        testRun.status === "Failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-455" :
                        testRun.status === "Queued" ? "bg-slate-150 text-slate-700 dark:bg-slate-800 dark:text-slate-350 animate-pulse" :
                        "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 animate-pulse"
                      }`}>
                        {testRun.status}
                      </span>
                    </div>
                  </div>

                  {/* Collapsible Steps list */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50/20 dark:bg-slate-950/10 border-t border-slate-100 dark:border-slate-800 space-y-3.5 animate-in slide-in-from-top-1 duration-150">
                      {testRun.stepResults.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No execution logs yet. Step-by-step telemetry will render when active.</p>
                      ) : (
                        <div className="space-y-3">
                          {testRun.stepResults.map((step) => (
                            <div
                              key={step.id}
                              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-background shadow-sm space-y-2.5"
                            >
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="flex items-start gap-2 text-xs">
                                  <span className="font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                    Step {step.stepNumber}
                                  </span>
                                  <p className="font-bold text-slate-800 dark:text-slate-200">{step.actionDescription}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* Step status badge */}
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                    step.status === "Passed" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                                    step.status === "Failed" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-455" :
                                    step.status === "SelfHealed" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" :
                                    step.status === "Skipped" ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" :
                                    "bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 animate-pulse"
                                  }`}>
                                    {step.status === "SelfHealed" ? "Self Healed" : step.status}
                                  </span>
                                </div>
                              </div>

                              {/* Details */}
                              <div className="text-xs space-y-1 text-slate-500 font-medium pl-2.5 border-l-2 border-slate-100 dark:border-slate-800">
                                <div>Expected: <span className="text-slate-700 dark:text-slate-350">{step.expectedResult}</span></div>
                                {step.actualResult && (
                                  <div>Actual: <span className="text-slate-650 dark:text-slate-400 italic">&quot;{step.actualResult}&quot;</span></div>
                                )}
                              </div>

                              {/* Self Healing Details */}
                              {step.status === "SelfHealed" && step.notes && (
                                <div className="mt-2 p-3 bg-amber-50/50 dark:bg-amber-955/10 border border-amber-200/50 dark:border-amber-900/50 rounded-xl space-y-1">
                                  <div className="flex items-center gap-1 text-[11px] font-black text-amber-600">
                                    <AlertTriangle className="h-3.5 w-3.5 fill-amber-100 text-amber-600" />
                                    Self-Healing Recovery Logs
                                  </div>
                                  <p className="text-[10px] text-amber-800 dark:text-amber-400 leading-normal whitespace-pre-line font-mono">
                                    {step.notes}
                                  </p>
                                </div>
                              )}

                              {/* Safety Skipped Details */}
                              {step.status === "Skipped" && (
                                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                                  <div className="flex items-center gap-1 text-[11px] font-black text-slate-500">
                                    <ShieldAlert className="h-3.5 w-3.5 text-slate-450" />
                                    Safety Sandbox Intercepted Action
                                  </div>
                                  <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-normal">
                                    This action matches the active safety filter rules (contains word keywords like delete/pay). The step execution was skipped to protect the test database.
                                  </p>
                                </div>
                              )}

                              {/* Error details */}
                              {step.status === "Failed" && step.errorDetails && (
                                <div className="mt-2 p-3 bg-rose-50/40 dark:bg-rose-955/10 border border-rose-200/50 dark:border-rose-900/50 rounded-xl">
                                  <p className="text-[10px] text-rose-700 dark:text-rose-455 font-mono leading-normal whitespace-pre-line">
                                    {step.errorDetails}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 4. Grid of Auto-Generated Bugs */}
      {run.bugReports.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <Bug className="h-5 w-5 text-red-500" /> Auto-Generated Bug Reports
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {run.bugReports.map((bug) => (
              <div
                key={bug.id}
                className="p-5 border border-red-150 dark:border-red-950 bg-red-50/10 dark:bg-red-950/5 rounded-2xl shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-sm text-red-800 dark:text-red-400 leading-tight">
                    {bug.title}
                  </h4>
                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200/50">
                    {bug.severity}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 leading-relaxed max-h-36 overflow-y-auto space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                  <div>
                    <strong>Steps:</strong>
                    <p className="whitespace-pre-line font-mono text-[10px] text-slate-650 dark:text-slate-400 mt-0.5">
                      {bug.stepsToReproduce}
                    </p>
                  </div>
                  <div className="border-t border-dashed my-1.5 pt-1.5">
                    <strong>Expected:</strong>
                    <p className="text-slate-650 dark:text-slate-400 mt-0.5">{bug.expectedResult}</p>
                  </div>
                  <div>
                    <strong>Actual:</strong>
                    <p className="text-rose-700 dark:text-rose-455 mt-0.5">{bug.actualResult}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Final AI Summary Card */}
      {run.status === "Completed" && run.summary && (
        <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
          <h3 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2 border-b pb-3">
            <Sparkles className="h-5 w-5 text-indigo-500 fill-indigo-100 animate-pulse" /> AI Agent Run Summary Explanation
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed whitespace-pre-line font-medium">
            {run.summary}
          </p>
        </div>
      )}
    </div>
  )
}
