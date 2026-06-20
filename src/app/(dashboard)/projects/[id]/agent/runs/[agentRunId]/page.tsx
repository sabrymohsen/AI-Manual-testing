"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
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
  Check,
  Save,
  Trash
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

interface QAAgentRun {
  id: string
  status: string
  mode: string
  goal: string
  safetyLevel: string
  plan: any
  scannerResult: any
  summary: any
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  steps: Step[]
  findings: Finding[]
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
}

export default function QAAgentTelemetryDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [run, setRun] = useState<QAAgentRun | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Local plan editing state for Semi-Autonomous approval modal
  const [editingPlanTests, setEditingPlanTests] = useState<any[] | null>(null)
  const [approving, setApproving] = useState(false)
  const [savingTests, setSavingTests] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    fetchRunDetails()

    let intervalId: any
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

  async function handleCancelRun() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/agent/runs/${params.agentRunId}/cancel`, {
        method: "POST"
      })
      if (res.ok) {
        fetchRunDetails(true)
      }
    } catch {
      alert("Error cancelling run")
    } finally {
      setCancelling(false)
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

  const showHeartbeatWarning =
    !["Completed", "Failed", "Cancelled"].includes(run.status) &&
    run.status !== "Queued" &&
    (!run.lastHeartbeatAt || (Date.now() - new Date(run.lastHeartbeatAt).getTime() > 60000))

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
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-50">Agent Telemetry Stream</h1>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Session ID: <span className="font-mono text-slate-800 dark:text-slate-250 font-bold">{run.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!["Completed", "Failed", "Cancelled"].includes(run.status) && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-955/10 border border-indigo-100/50 dark:border-indigo-900/50 text-xs font-bold text-indigo-650 dark:text-indigo-400 animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Live Updates (2s poll)
              </div>
              <Button variant="destructive" size="sm" onClick={handleCancelRun} disabled={cancelling} className="h-9 rounded-xl text-xs font-semibold">
                Cancel Agent Run
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Heartbeat Alert */}
      {showHeartbeatWarning && (
        <div className="p-4 border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-955/10 rounded-2xl text-xs font-semibold text-rose-700 dark:text-rose-455 flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="h-4.5 w-4.5 text-rose-550 shrink-0" />
          <div>
            <span className="font-bold">No worker heartbeat detected.</span> The worker may be stuck or stopped. Check if the queue worker is running in your terminal with <code className="bg-rose-100 dark:bg-rose-950 px-1 py-0.5 rounded font-mono font-bold">npm run worker</code>.
          </div>
        </div>
      )}

      {/* Telemetry Status Banner */}
      <div className="p-4 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm grid gap-4 sm:grid-cols-3">
        <div className="text-xs">
          <span className="font-black uppercase text-slate-400 tracking-wider">Current Phase</span>
          <div className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5">{run.currentPhase || run.status}</div>
        </div>
        <div className="text-xs">
          <span className="font-black uppercase text-slate-400 tracking-wider">Status Message</span>
          <div className="font-bold text-indigo-650 dark:text-indigo-400 text-sm mt-0.5">{run.currentMessage || "Awaiting execution startup..."}</div>
        </div>
        <div className="text-xs">
          <span className="font-black uppercase text-slate-400 tracking-wider">Last Heartbeat</span>
          <div className="font-bold text-slate-700 dark:text-slate-350 text-sm mt-0.5">
            {run.lastHeartbeatAt ? new Date(run.lastHeartbeatAt).toLocaleTimeString() : "No heartbeat recorded"}
          </div>
        </div>
      </div>

      {/* 1. Timeline Tracker */}
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
                  isActive ? "bg-indigo-600 border-indigo-600 text-white scale-105 animate-pulse" :
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

      {/* 2. Mini telemetry dashboard */}
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

      {/* 3. Semi-Autonomous plan approval UI */}
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

      {/* 4. Executed steps telemetry log */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-slate-400" /> Page Execution Telemetry
        </h3>

        {run.steps.length === 0 ? (
          <div className="text-center border rounded-2xl py-12 bg-slate-50/40 dark:bg-slate-900 text-xs text-slate-500 font-semibold space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
            <p className="italic">
              {run.currentMessage || "Waiting for worker to pick up this job."}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {run.steps.map((step) => (
              <div key={step.id} className="p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-start gap-2.5 text-xs">
                    <span className="font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Step {step.stepNumber}</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{step.name}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                    step.status === "Passed" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                    step.status === "Failed" ? "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-400" :
                    step.status === "SelfHealed" ? "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400" :
                    step.status === "Skipped" ? "bg-slate-100 text-slate-500 dark:bg-slate-800" :
                    "bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 animate-pulse"
                  }`}>{step.status}</span>
                </div>

                <div className="text-xs text-slate-500 font-medium pl-3 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5">
                  {step.details?.expected && <div>Expected: <span className="text-slate-700 dark:text-slate-350">{step.details.expected}</span></div>}
                  {step.details?.resolvedSelector && <div>Selector: <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">{step.details.resolvedSelector}</span></div>}
                </div>

                {/* Self Healing Logs */}
                {step.status === "SelfHealed" && step.details?.healingLogs && (
                  <div className="p-3 bg-amber-50/50 dark:bg-amber-955/10 border border-amber-250/50 dark:border-amber-900/50 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> Self-Healing Recovery Logs
                    </div>
                    <p className="text-[10px] text-amber-800 dark:text-amber-450 leading-normal font-mono whitespace-pre-line">{step.details.healingLogs}</p>
                  </div>
                )}

                {/* Safety Skipped Details */}
                {step.status === "Skipped" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 text-slate-450" /> Safety Sandbox Intercepted Action
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-normal">{step.error}</p>
                  </div>
                )}

                {/* Error details */}
                {step.status === "Failed" && step.error && (
                  <div className="p-3 bg-rose-50/40 dark:bg-rose-955/10 border border-rose-250/50 dark:border-rose-900/50 rounded-xl">
                    <p className="text-[10px] text-rose-700 dark:text-rose-455 font-mono whitespace-pre-line leading-normal">{step.error}</p>
                  </div>
                )}

                {/* Screenshot */}
                {step.screenshotPath && (
                  <div className="mt-2 max-w-sm border rounded-lg overflow-hidden bg-accent/20 p-1.5">
                     <img src={`/api/files/${step.screenshotPath}`} alt="Step Evidence Screenshot" className="rounded object-contain max-h-36 w-full" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scanned Layout & Planned Tests */}
      {run.scannerResult && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Scanned Elements */}
          <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              Scanned App Elements
            </h4>
            <div className="text-xs space-y-2 max-h-80 overflow-y-auto pr-2">
              <div><span className="font-bold text-slate-700 dark:text-slate-350">Page Title:</span> {run.scannerResult.title}</div>
              <div><span className="font-bold text-slate-700 dark:text-slate-350">Inputs found:</span> {run.scannerResult.inputs?.length || 0}</div>
              <div><span className="font-bold text-slate-700 dark:text-slate-350">Buttons found:</span> {run.scannerResult.buttons?.length || 0}</div>
              <div><span className="font-bold text-slate-700 dark:text-slate-350">Links found:</span> {run.scannerResult.links?.length || 0}</div>
              <div><span className="font-bold text-slate-700 dark:text-slate-350">Dropdowns found:</span> {run.scannerResult.dropdowns?.length || 0}</div>
              <div className="border-t pt-2 mt-2 space-y-1">
                <div className="font-bold text-slate-600 mb-1">Inputs Details:</div>
                {run.scannerResult.inputs?.map((inp: any, idx: number) => (
                  <div key={idx} className="p-2 rounded bg-slate-50 dark:bg-slate-850 font-mono text-[10px]">
                    {inp.tagName}[type={inp.type || "text"}] - label="{inp.label}" placeholder="{inp.placeholder}"
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Planned Test Cases */}
          <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              Generated Test Plan Scenarios
            </h4>
            <div className="text-xs space-y-2.5 max-h-80 overflow-y-auto pr-2">
              {run.plan?.tests ? (
                run.plan.tests.map((test: any, idx: number) => (
                  <div key={idx} className="p-3 border rounded-xl bg-background space-y-1.5">
                    <div className="font-bold text-slate-800 dark:text-slate-250">{test.name}</div>
                    <div className="text-[10px] text-slate-450 leading-relaxed">
                      {test.steps.map((st: any, sIdx: number) => (
                        <div key={sIdx}>
                          {sIdx + 1}. {st.action} on <code className="bg-slate-50 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[9px]">{st.target}</code> {st.value ? `with "${st.value}"` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-450 italic text-center pt-8">No test scenarios generated yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Findings and Bug Reports */}
      {run.findings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-indigo-500" /> Defect Findings & Risks Mapped
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {run.findings.map((f) => (
              <div key={f.id} className="p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm space-y-3">
                <div className="flex justify-between items-start gap-2">
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
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">
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

      {/* 6. Completed Run Summary Report */}
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
    </div>
  )
}
