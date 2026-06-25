"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
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
  Map,
  Code,
  LayoutGrid,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  Play,
  TrendingUp,
  Compass
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
  screenshotAfter: string | null
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

interface AgentBrainRun {
  id: string
  status: "Queued" | "Understanding" | "Planning" | "Executing" | "Reporting" | "Completed" | "Failed" | "Cancelled"
  mode: "Exploration" | "Planning" | "Execution" | "Autonomous"
  safetyDoNotDelete: boolean
  safetyDoNotModify: boolean
  userInstruction: string | null
  summary: string | null
  appUnderstanding: {
    appType?: string
    modules?: string[]
    riskAreas?: string[]
    suggestedTestFocus?: string[]
    pagesDetected?: string[]
  } | null
  executionPlan: {
    executionPlan?: Array<{
      testName: string
      priority: string
      role: string
      strategy: string
      steps: Array<{
        actionDescription: string
        expectedResult: string
        actionType: string
        targetType: string
        targetValue: string
      }>
    }>
  } | null
  metrics: {
    planningDurationMs?: number
    averageStepDurationMs?: number
    locatorResolutionMs?: number
    memoryLookupMs?: number
    totalDurationMs?: number
  } | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  testRuns: TestRun[]
  bugReports: BugReport[]
}

export default function AgentBrainTelemetryDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [run, setRun] = useState<AgentBrainRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)

  // Sub-accordions open state
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})
  const [showUnderstanding, setShowUnderstanding] = useState(true)
  const [showPlannerOutput, setShowPlannerOutput] = useState(true)

  useEffect(() => {
    fetchRunDetails()

    let intervalId: any
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
      const res = await fetch(`/api/projects/${params.id}/agent-brain/run/${params.runId}`)
      if (res.ok) {
        const data = await res.json()
        setRun(data.agentRun)
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  async function handleConfirmCancel() {
    const res = await fetch(`/api/projects/${params.id}/agent-brain/run/${params.runId}/cancel`, {
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

  function toggleRunExpand(runId: string) {
    setExpandedRuns((prev) => ({
      ...prev,
      [runId]: !prev[runId]
    }))
  }

  function formatDuration(ms?: number) {
    if (!ms) return "-"
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
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
        <p className="text-destructive font-bold text-lg">Agent Brain session not found</p>
        <Link href={`/projects/${params.id}/agent-brain`} className="text-indigo-600 hover:underline mt-2 inline-block">Back to runs list</Link>
      </div>
    )
  }

  const stages = ["Queued", "Understanding", "Planning", "Executing", "Reporting", "Completed"]
  const currentStageIndex = stages.indexOf(run.status === "Failed" ? "Completed" : run.status === "Cancelled" ? "Completed" : run.status)

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${params.id}/agent-brain`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-50">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-50">Brain Telemetry Stream</h1>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Session ID: <span className="font-mono text-slate-800 dark:text-slate-250 font-bold">{run.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {["Queued", "Understanding", "Planning", "Executing", "Reporting"].includes(run.status) && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-955/10 border border-indigo-100/50 dark:border-indigo-900/50 text-xs font-bold text-indigo-650 dark:text-indigo-400 animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Stream Sync Active
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowCancelModal(true)} disabled={cancelling} className="h-9 rounded-xl text-xs font-semibold">
                Cancel Run
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchRunDetails(true)} className="h-9 rounded-xl text-xs font-semibold">
            Force Sync
          </Button>
        </div>
      </div>

      {/* 1. Timeline Stages Tracker */}
      <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md">
        <h3 className="text-sm font-black uppercase text-slate-400 tracking-wider mb-5">Agent Cognitive Timeline</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 md:gap-2">
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex || run.status === "Completed"
            const isActive = idx === currentStageIndex
            const labelMap: Record<string, string> = {
              Queued: "Waiting",
              Understanding: "LLM Brain scan",
              Planning: "Planner Scenarios",
              Executing: "Executor Runs",
              Reporting: "Result summaries",
              Completed: run.status === "Failed" ? "Failed Run" : "Sweep complete"
            }

            return (
              <div key={stage} className="flex flex-col items-center md:items-start text-center md:text-left space-y-2 p-3 rounded-xl border border-transparent hover:bg-slate-50/40 dark:hover:bg-slate-850/40 transition-colors">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-sm border shadow-sm transition-all ${
                  isCompleted ? "bg-emerald-500 border-emerald-500 text-white" :
                  isActive ? "bg-indigo-600 border-indigo-600 text-white scale-105 animate-pulse" :
                  "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-4.5 w-4.5" /> : idx + 1}
                </div>
                <div>
                  <h4 className={`text-xs font-black ${isActive ? "text-indigo-600 dark:text-indigo-400" : isCompleted ? "text-emerald-600 dark:text-emerald-450" : "text-slate-400"}`}>
                    {stage}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                    {labelMap[stage]}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. Latency Metrics Dashboard */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {/* Metric 1 */}
        <div className="p-4 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Planning Duration</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <h4 className="text-2xl font-black mt-2 text-slate-850 dark:text-slate-100">
            {run.metrics?.planningDurationMs ? formatDuration(run.metrics.planningDurationMs) : "-"}
          </h4>
          <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-0.5">
            LLM Scenario Planning time (Target: &lt;3s)
          </p>
        </div>

        {/* Metric 2 */}
        <div className="p-4 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Avg Step Duration</span>
            <Activity className="h-4 w-4 text-indigo-500" />
          </div>
          <h4 className="text-2xl font-black mt-2 text-slate-850 dark:text-slate-100">
            {run.metrics?.averageStepDurationMs ? formatDuration(run.metrics.averageStepDurationMs) : "-"}
          </h4>
          <p className="text-[9px] text-slate-400 mt-1">
            Average browser action step (Target: &lt;2s)
          </p>
        </div>

        {/* Metric 3 */}
        <div className="p-4 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Locator Resolution</span>
            <Compass className="h-4 w-4 text-purple-500" />
          </div>
          <h4 className="text-2xl font-black mt-2 text-slate-850 dark:text-slate-100">
            {run.metrics?.locatorResolutionMs ? `${run.metrics.locatorResolutionMs.toFixed(1)}ms` : "-"}
          </h4>
          <p className="text-[9px] text-slate-400 mt-1">
            Locator evaluation delay (Target: &lt;50ms)
          </p>
        </div>

        {/* Metric 4 */}
        <div className="p-4 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Memory Lookup</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <h4 className="text-2xl font-black mt-2 text-slate-850 dark:text-slate-100">
            {run.metrics?.memoryLookupMs ? `${run.metrics.memoryLookupMs.toFixed(1)}ms` : "-"}
          </h4>
          <p className="text-[9px] text-slate-400 mt-1">
            Cognitive state index search (Target: &lt;10ms)
          </p>
        </div>
      </div>

      {/* 3. LLM Brain & Planner outputs accordions */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Understanding panel */}
        <div className="md:col-span-1 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3 cursor-pointer" onClick={() => setShowUnderstanding(!showUnderstanding)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <Brain className="h-5 w-5 text-indigo-500" /> Understanding Layer
            </h3>
            {showUnderstanding ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </div>

          {showUnderstanding && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-150">
              {run.appUnderstanding ? (
                <div className="space-y-3 text-xs leading-relaxed">
                  <div>
                    <strong className="text-slate-400 block font-black uppercase text-[10px]">App Structure Type</strong>
                    <span className="text-slate-800 dark:text-slate-200 font-bold">{run.appUnderstanding.appType}</span>
                  </div>
                  <div>
                    <strong className="text-slate-400 block font-black uppercase text-[10px]">Detected Modules</strong>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {run.appUnderstanding.modules?.map((m, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-350 font-semibold">{m}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong className="text-slate-400 block font-black uppercase text-[10px]">Risk Areas</strong>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {run.appUnderstanding.riskAreas?.map((r, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400 font-semibold">{r}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong className="text-slate-400 block font-black uppercase text-[10px]">Page Paths Mapped</strong>
                    <div className="space-y-1 mt-1.5 max-h-40 overflow-y-auto pr-1">
                      {run.appUnderstanding.pagesDetected?.map((p, i) => (
                        <div key={i} className="p-2 border rounded-lg bg-slate-50/50 dark:bg-slate-850/40 font-mono text-[10px] truncate">{p}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Context analysis pending. Waiting for Understanding stage.</p>
              )}
            </div>
          )}
        </div>

        {/* Planner Output panel */}
        <div className="md:col-span-2 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3 cursor-pointer" onClick={() => setShowPlannerOutput(!showPlannerOutput)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-purple-500" /> Planner Output (Decision Strategy)
            </h3>
            {showPlannerOutput ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </div>

          {showPlannerOutput && (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1 animate-in slide-in-from-top-2 duration-150">
              {run.executionPlan?.executionPlan && run.executionPlan.executionPlan.length > 0 ? (
                <div className="space-y-3">
                  {run.executionPlan.executionPlan.map((scenario, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/30 space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{scenario.testName}</h4>
                        <div className="flex gap-1.5">
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${
                            scenario.priority === "Critical" ? "bg-red-50 text-red-700 dark:bg-red-950/20" :
                            scenario.priority === "High" ? "bg-amber-50 text-amber-700 dark:bg-amber-955/20" :
                            "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-350"
                          }`}>{scenario.priority}</span>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 font-semibold">{scenario.strategy}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">Steps planned: {scenario.steps.length} steps</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No planner output generated yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Executed runs list (Accordion list) */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-slate-400" /> Playwright Executor Actions
        </h3>

        {run.testRuns.length === 0 ? (
          <div className="text-center border rounded-2xl py-8 bg-slate-50/40 dark:bg-slate-900">
            <p className="text-xs text-slate-400 italic">E2E executions logs pending. Run must enter Executing stage.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {run.testRuns.map((testRun) => {
              const isExpanded = expandedRuns[testRun.id]
              const passedCount = testRun.stepResults.filter(s => s.status === "Passed").length
              const healedCount = testRun.stepResults.filter(s => s.status === "SelfHealed").length
              const skippedCount = testRun.stepResults.filter(s => s.status === "Skipped").length
              const totalCount = testRun.stepResults.length

              return (
                <div key={testRun.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                  {/* Collapsible Header */}
                  <div
                    onClick={() => toggleRunExpand(testRun.id)}
                    className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850/40 select-none border-b border-transparent data-[expanded=true]:border-slate-100 dark:data-[expanded=true]:border-slate-800"
                    data-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="text-slate-450 hover:text-slate-600 transition-colors">
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-150">{testRun.testCase.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-slate-400">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{testRun.id.substring(0, 8)}</span>
                          <span>•</span>
                          <span>Browser: {testRun.browserType} ({testRun.viewport})</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-xs text-slate-500 font-semibold bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
                        Steps: <strong className="text-slate-800 dark:text-slate-100">{passedCount + healedCount}/{totalCount}</strong>
                        {healedCount > 0 && <span className="text-amber-600 ml-1">({healedCount} healed)</span>}
                        {skippedCount > 0 && <span className="text-slate-400 ml-1">({skippedCount} skipped)</span>}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                        testRun.status === "Passed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
                        testRun.status === "Failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-455" :
                        "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 animate-pulse"
                      }`}>{testRun.status}</span>
                    </div>
                  </div>

                  {/* Collapsible Steps list */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50/20 dark:bg-slate-950/10 border-t border-slate-150 dark:border-slate-800 space-y-3.5 animate-in slide-in-from-top-1 duration-150">
                      {testRun.stepResults.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No execution steps logged.</p>
                      ) : (
                        <div className="space-y-3">
                          {testRun.stepResults.map((step) => (
                            <div key={step.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-background shadow-sm space-y-2.5">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="flex items-start gap-2 text-xs">
                                  <span className="font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Step {step.stepNumber}</span>
                                  <p className="font-bold text-slate-800 dark:text-slate-200">{step.actionDescription}</p>
                                </div>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                                  step.status === "Passed" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                                  step.status === "Failed" ? "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-455" :
                                  step.status === "SelfHealed" ? "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400" :
                                  "bg-slate-100 text-slate-500"
                                }`}>{step.status === "SelfHealed" ? "Self Healed" : step.status}</span>
                              </div>

                              <div className="text-xs text-slate-500 font-medium pl-2.5 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5">
                                <div>Expected: <span className="text-slate-700 dark:text-slate-350">{step.expectedResult}</span></div>
                                {step.actualResult && <div>Actual: <span className="text-slate-650 dark:text-slate-400 italic">&quot;{step.actualResult}&quot;</span></div>}
                              </div>

                              {/* Self Healing logs */}
                              {step.status === "SelfHealed" && step.notes && (
                                <div className="p-3 bg-amber-50/50 dark:bg-amber-955/10 border border-amber-200/50 dark:border-amber-900/50 rounded-xl space-y-1">
                                  <div className="flex items-center gap-1 text-[11px] font-black text-amber-600">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Self-Healing Recovery Logs
                                  </div>
                                  <p className="text-[10px] text-amber-800 dark:text-amber-400 leading-normal font-mono whitespace-pre-line">{step.notes}</p>
                                </div>
                              )}

                              {/* Error details */}
                              {step.status === "Failed" && step.errorDetails && (
                                <div className="p-3 bg-rose-50/40 dark:bg-rose-955/10 border border-rose-200/50 dark:border-rose-900/50 rounded-xl">
                                  <p className="text-[10px] text-rose-700 dark:text-rose-455 font-mono whitespace-pre-line leading-normal">{step.errorDetails}</p>
                                </div>
                              )}

                              {/* Screenshot */}
                              {step.screenshotAfter && (
                                <div className="mt-2.5 max-w-sm border rounded-lg overflow-hidden bg-accent/20 p-1.5">
                                  <img src={`/api/files/${step.screenshotAfter}`} alt="Step Screenshot" className="rounded object-contain max-h-36 w-full" />
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

      {/* 5. Bug Reports Grid */}
      {run.bugReports.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <Bug className="h-5 w-5 text-red-500 animate-bounce" /> Auto-Generated Defect Reports
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {run.bugReports.map((bug) => (
              <div key={bug.id} className="p-5 border border-red-150 dark:border-red-950/80 bg-red-50/10 dark:bg-red-955/5 rounded-2xl shadow-sm space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-sm text-red-800 dark:text-red-400 leading-tight">{bug.title}</h4>
                  <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-red-100 text-red-700">{bug.severity}</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                  <div><strong>Steps:</strong> <p className="whitespace-pre-line text-[10px] font-mono mt-0.5 text-slate-650 dark:text-slate-400">{bug.stepsToReproduce}</p></div>
                  <div className="border-t border-dashed my-1.5 pt-1.5"><strong>Expected:</strong> <span className="text-slate-650 dark:text-slate-400">{bug.expectedResult}</span></div>
                  <div><strong>Actual:</strong> <span className="text-rose-700 dark:text-rose-405">{bug.actualResult}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Summary panel */}
      {run.status === "Completed" && run.summary && (
        <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
          <h3 className="text-base font-bold text-slate-950 dark:text-slate-50 flex items-center gap-2 border-b pb-3">
            <Zap className="h-5 w-5 text-indigo-500 animate-pulse" /> AI Agent Run Summary Explanation
          </h3>
          <p className="text-xs text-slate-605 dark:text-slate-350 leading-relaxed whitespace-pre-line font-semibold">
            {run.summary}
          </p>
        </div>
      )}      {/* Cancel Confirmation Modal */}
      <ConfirmDialog
        open={showCancelModal}
        title="Cancel Agent Run?"
        description="Are you sure you want to cancel the Agent Brain run? Any running tests will be aborted."
        confirmLabel="Confirm Cancel Run"
        cancelLabel="Keep Running"
        variant="warning"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />
    </div>
  )
}
