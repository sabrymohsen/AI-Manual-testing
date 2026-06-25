"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Brain,
  Play,
  ChevronLeft,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  History,
  AlertTriangle,
  ExternalLink,
  Bug,
  CheckCircle,
  Clock,
  Gauge,
  Database,
  Plus,
  Compass,
  Check
} from "lucide-react"

interface Project {
  id: string
  name: string
  webAppUrl: string
}

interface AgentBrainRun {
  id: string
  status: "Queued" | "Understanding" | "Planning" | "Executing" | "Reporting" | "Completed" | "Failed" | "Cancelled"
  mode: "Exploration" | "Planning" | "Execution" | "Autonomous"
  safetyDoNotDelete: boolean
  safetyDoNotModify: boolean
  userInstruction: string | null
  summary: string | null
  metrics: {
    planningDurationMs?: number
    averageStepDurationMs?: number
    locatorResolutionMs?: number
    memoryLookupMs?: number
    totalDurationMs?: number
  } | null
  createdAt: string
}

interface AgentMemoryState {
  successfulLocators: Record<string, { selector: string; successCount: number }>
  failedLocatorPatterns: string[]
  stableComponents: string[]
  flakyComponents: string[]
  userCorrections: Record<string, string>
}

export default function AgentBrainDashboardPage() {
  const params = useParams()
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<AgentBrainRun[]>([])
  const [memory, setMemory] = useState<AgentMemoryState | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [runToCancel, setRunToCancel] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Configure settings
  const [selectedMode, setSelectedMode] = useState<"Exploration" | "Planning" | "Execution" | "Autonomous">("Autonomous")
  const [userInstruction, setUserInstruction] = useState("")
  const [safetyDoNotDelete, setSafetyDoNotDelete] = useState(true)
  const [safetyDoNotModify, setSafetyDoNotModify] = useState(false)

  // Memory Visualizer Tabs
  const [activeMemoryTab, setActiveMemoryTab] = useState<"successful" | "stable" | "flaky" | "patterns" | "corrections">("successful")

  // Add manual correction modal state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [targetValue, setTargetValue] = useState("")
  const [correctedSelector, setCorrectedSelector] = useState("")
  const [submittingCorrection, setSubmittingCorrection] = useState(false)

  useEffect(() => {
    fetchProjectRunsAndMemory()
  }, [params.id])

  async function fetchProjectRunsAndMemory() {
    try {
      const projRes = await fetch(`/api/projects/${params.id}`)
      const projData = await projRes.json()
      setProject(projData.project)

      const runsRes = await fetch(`/api/projects/${params.id}/agent-brain/run`)
      const runsData = await runsRes.json()
      setRuns(runsData.runs || [])

      const memRes = await fetch(`/api/projects/${params.id}/agent-brain/memory`)
      const memData = await memRes.json()
      setMemory(memData.memory)
    } catch (err) {
      console.error("Failed to load details:", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleTriggerRun() {
    setTriggering(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/agent-brain/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          userInstruction: userInstruction || null,
          safetyDoNotDelete,
          safetyDoNotModify,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const newRun = data.agentRun
        router.push(`/projects/${params.id}/agent-brain/${newRun.id}`)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(errorData.error || "Failed to trigger Agent Brain execution.")
      }
    } catch {
      alert("Network error starting agent run.")
    } finally {
      setTriggering(false)
    }
  }

  async function handleAddCorrection(e: React.FormEvent) {
    e.preventDefault()
    if (!targetValue.trim() || !correctedSelector.trim()) {
      alert("Both target value and corrected selector are required.")
      return
    }

    setSubmittingCorrection(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/agent-brain/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetValue, correctedSelector }),
      })

      if (res.ok) {
        setTargetValue("")
        setCorrectedSelector("")
        setShowCorrectionModal(false)
        fetchProjectRunsAndMemory()
      } else {
        alert("Failed to submit manual correction.")
      }
    } catch {
      alert("Error submitting correction.")
    } finally {
      setSubmittingCorrection(false)
    }
  }

  async function handleConfirmCancel(runId: string) {
    const res = await fetch(`/api/projects/${params.id}/agent-brain/run/${runId}/cancel`, {
      method: "POST"
    })
    if (res.ok) {
      setRunToCancel(null)
      fetchProjectRunsAndMemory()
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || "Failed to cancel run")
    }
  }

  function formatDuration(ms?: number) {
    if (!ms) return "-"
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "Queued":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Queued</span>
      case "Understanding":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">Understanding Layer</span>
      case "Planning":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400">Planning Layer</span>
      case "Executing":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">Playwright Executing</span>
      case "Reporting":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-violet-50 text-violet-700 dark:bg-violet-955/20 dark:text-violet-400">Reporting Layer</span>
      case "Completed":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-450">Completed</span>
      case "Failed":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-455">Failed</span>
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-500">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm text-muted-foreground font-semibold">Loading Agent Brain...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive font-bold text-lg">Project not found</p>
        <Link href="/projects" className="text-indigo-650 hover:underline mt-2 inline-block">Back to Projects</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${project.id}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-50">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Agent Brain</h1>
              <span className="px-2.5 py-0.5 text-[10px] font-black tracking-wider uppercase bg-indigo-600 text-white rounded-md">Cognitive Mode</span>
            </div>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Persistent Memory-driven testing for: <span className="text-slate-800 dark:text-slate-200 font-bold">{project.name}</span>
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProjectRunsAndMemory} className="flex items-center gap-1.5 rounded-xl text-xs font-semibold h-9">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Dashboard
        </Button>
      </div>

      {/* Mode Control & Safety configuration */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-6">
            <div className="flex items-center gap-2 border-b pb-3.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">Execution Pipeline Settings</h3>
                <p className="text-xs text-slate-500">Formulate strategic scenarios, depths, and intents</p>
              </div>
            </div>

            {/* Mode selection cards */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Select Agent Brain Mode</label>
              <div className="grid gap-4 sm:grid-cols-4">
                {[
                  { id: "Exploration", title: "Exploration", desc: "Crawls routes and DOM layouts. No test executions are generated.", time: "~1 min" },
                  { id: "Planning", title: "Planning", desc: "Crawl mapping and LLM scenario planning. Does not run tests.", time: "~1.5 mins" },
                  { id: "Execution", title: "Execution", desc: "Runs previously planned test scripts using dynamic Playwright healing.", time: "Variable" },
                  { id: "Autonomous", title: "Autonomous", desc: "Full cognitive loop: Discover, Plan, Execute, Self-Heal, Memory.", time: "~3-5 mins" }
                ].map((modeItem) => (
                  <div
                    key={modeItem.id}
                    onClick={() => setSelectedMode(modeItem.id as any)}
                    className={`cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                      selectedMode === modeItem.id
                        ? "border-indigo-650 bg-indigo-50/20 dark:border-indigo-500 dark:bg-indigo-950/20 ring-2 ring-indigo-600/10"
                        : "border-slate-200 hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 bg-background"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-black uppercase text-indigo-650 dark:text-indigo-400">{modeItem.title}</span>
                        {selectedMode === modeItem.id && <div className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{modeItem.desc}</p>
                    </div>
                    <div className="mt-3 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-2 py-0.5 rounded w-fit">
                      {modeItem.time}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt instruction input */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Focus Instruction (Optional)</label>
              <Input
                value={userInstruction}
                onChange={(e) => setUserInstruction(e.target.value)}
                placeholder="e.g. Focus on checking user profile edits, or test boundaries of auth page"
                className="rounded-xl h-10 border-slate-200 dark:border-slate-800 bg-background focus-visible:ring-indigo-500 focus-visible:border-indigo-550"
              />
            </div>

            {/* Run Button */}
            <div className="pt-2 border-t">
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-850 text-white font-bold h-11 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                onClick={handleTriggerRun}
                disabled={triggering}
              >
                {triggering ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Enqueuing Cognitive Job...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white text-white" /> Dispatch Brain Agent
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Safety Block Guard Panel (Right Card) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-5">
            <div className="flex items-center gap-2 border-b pb-3.5">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-650 rounded-xl">
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-slate-50">Decision Sandbox</h3>
                <p className="text-[11px] text-slate-500">Guard configuration profiles</p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 p-3 rounded-xl border bg-slate-50/40 dark:bg-slate-850/40">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Do Not Delete Data
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Skipping steps matching delete patterns (e.g. delete, cancel_account) in E2E runs.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyDoNotDelete}
                onChange={(e) => setSafetyDoNotDelete(e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 mt-1 cursor-pointer"
              />
            </div>

            <div className="flex items-start justify-between gap-4 p-3 rounded-xl border bg-slate-50/40 dark:bg-slate-850/40">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Do Not Modify Settings
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Skipping steps editing user configuration profiles or invoking checkout checkout.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyDoNotModify}
                onChange={(e) => setSafetyDoNotModify(e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 mt-1 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Project Memory Visualizer (DB Memory) */}
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-400" /> Project Cognitive Memory Store
          </h3>
          <Button
            size="sm"
            onClick={() => setShowCorrectionModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold h-8 flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add Manual Correction
          </Button>
        </div>

        {memory ? (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-md">
            {/* Visualizer tabs list */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/20 px-4 overflow-x-auto gap-4">
              {[
                { id: "successful", label: "Successful Locators" },
                { id: "stable", label: "Stable Components" },
                { id: "flaky", label: "Flaky Selectors" },
                { id: "patterns", label: "Failed Class Patterns" },
                { id: "corrections", label: "User Manual Corrections" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveMemoryTab(tab.id as any)}
                  className={`py-3 text-xs font-black border-b-2 whitespace-nowrap transition-colors ${
                    activeMemoryTab === tab.id
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content panel */}
            <div className="p-5 min-h-[180px] max-h-96 overflow-y-auto">
              {activeMemoryTab === "successful" && (
                <div className="space-y-2">
                  {Object.keys(memory.successfulLocators).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No selectors recorded in memory yet. Runs will learn them dynamically.</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b text-slate-400 font-bold uppercase">
                          <th className="pb-2">Original Selector / Description</th>
                          <th className="pb-2">Resolved Playwright Selector</th>
                          <th className="pb-2 text-right">Success Hit Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(memory.successfulLocators).map(([key, val]) => (
                          <tr key={key} className="border-b border-slate-50 dark:border-slate-800/60 py-2">
                            <td className="py-2 text-slate-700 dark:text-slate-300 font-semibold">{key}</td>
                            <td className="py-2 font-mono text-indigo-650 dark:text-indigo-400">{val.selector}</td>
                            <td className="py-2 text-right font-bold text-emerald-600">{val.successCount} hits</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeMemoryTab === "stable" && (
                <div className="flex flex-wrap gap-2">
                  {memory.stableComponents.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No component selectors marked stable yet. (Requires 3+ successful hits).</p>
                  ) : (
                    memory.stableComponents.map((sel, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400 font-mono">
                        <Check className="h-3.5 w-3.5" /> {sel}
                      </span>
                    ))
                  )}
                </div>
              )}

              {activeMemoryTab === "flaky" && (
                <div className="flex flex-wrap gap-2">
                  {memory.flakyComponents.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No selectors marked flaky. Excellent locator health!</p>
                  ) : (
                    memory.flakyComponents.map((sel, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 font-mono">
                        <AlertTriangle className="h-3.5 w-3.5" /> {sel}
                      </span>
                    ))
                  )}
                </div>
              )}

              {activeMemoryTab === "patterns" && (
                <div className="space-y-2">
                  {memory.failedLocatorPatterns.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No failed class or ID patterns registered.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {memory.failedLocatorPatterns.map((pat, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg border bg-rose-50/20 dark:bg-rose-955/10 text-xs font-mono text-rose-700 dark:text-rose-455">
                          {pat}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeMemoryTab === "corrections" && (
                <div className="space-y-2">
                  {Object.keys(memory.userCorrections).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No user corrections defined. Add corrections to bypass flaky automatic locators.</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b text-slate-400 font-bold uppercase">
                          <th className="pb-2">Brittle/Fail Target Description</th>
                          <th className="pb-2">Manual Corrected Override Selector</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(memory.userCorrections).map(([key, val]) => (
                          <tr key={key} className="border-b border-slate-50 dark:border-slate-800/60 py-2">
                            <td className="py-2 text-slate-700 dark:text-slate-350 font-semibold">{key}</td>
                            <td className="py-2 font-mono text-purple-600 dark:text-purple-400 font-bold">{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Loading memory state...</p>
        )}
      </div>

      {/* Manual Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 border rounded-2xl shadow-xl bg-background space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Brain className="h-5 w-5 text-indigo-650" />
              <h3 className="text-lg font-bold text-foreground">Add Manual Override Selector</h3>
            </div>
            <form onSubmit={handleAddCorrection} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Target Description / Value *</label>
                <Input
                  required
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="e.g. button.submit or Click Login"
                  className="rounded-xl"
                />
                <p className="text-[10px] text-slate-400">Target selector name as generated by planner steps</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Manual Override Selector (CSS/XPath) *</label>
                <Input
                  required
                  value={correctedSelector}
                  onChange={(e) => setCorrectedSelector(e.target.value)}
                  placeholder="e.g. [data-testid='submit-login'] or #submit-button"
                  className="rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400">Stable locator string to always use in browser runs</p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <Button variant="outline" type="button" onClick={() => setShowCorrectionModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingCorrection}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {submittingCorrection ? "Recording..." : "Save Correction"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Historical Sessions Table */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-400" /> Agent Brain History Runs
        </h3>

        {runs.length === 0 ? (
          <div className="text-center border rounded-2xl py-12 bg-white dark:bg-slate-900 shadow-sm">
            <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">No agent sessions triggered</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1.5">
              Launch a cognitive Agent run to crawl paths, generate test suites, and execute scans.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md bg-white dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-850 border-b">
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Run ID / Created</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Mode</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Instruction</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Metrics</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/40 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">{run.id.substring(0, 8)}...</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-1">
                          {new Date(run.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-bold ${
                          run.mode === "Exploration" ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/20 dark:text-cyan-400" :
                          run.mode === "Planning" ? "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400" :
                          run.mode === "Execution" ? "bg-indigo-50 text-indigo-650 dark:bg-indigo-950/20 dark:text-indigo-400" :
                          "bg-purple-50 text-purple-600 dark:bg-purple-955/20 dark:text-purple-400"
                        }`}>
                          {run.mode}
                        </span>
                      </td>
                      <td className="p-4">{getStatusBadge(run.status)}</td>
                      <td className="p-4 max-w-[200px] truncate text-xs text-slate-500 font-semibold" title={run.userInstruction || ""}>
                        {run.userInstruction || "None"}
                      </td>
                      <td className="p-4">
                        {run.metrics ? (
                          <div className="space-y-0.5 text-[10px] font-bold text-slate-500">
                            <div>Plan: {formatDuration(run.metrics.planningDurationMs)}</div>
                            {run.metrics.averageStepDurationMs ? (
                              <div>Avg Step: {formatDuration(run.metrics.averageStepDurationMs)}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="p-4 text-right flex items-center justify-end gap-2">
                        {!["Completed", "Failed", "Cancelled"].includes(run.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRunToCancel(run.id)}
                            className="text-xs font-bold text-rose-650 hover:text-rose-750 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-955/25 rounded-xl border-rose-200 dark:border-rose-900"
                          >
                            Cancel
                          </Button>
                        )}
                        <Link href={`/projects/${project.id}/agent-brain/${run.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-bold text-indigo-650 hover:text-indigo-750 dark:text-indigo-400 dark:hover:bg-slate-800 rounded-xl"
                          >
                            Telemetry <ExternalLink className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <ConfirmDialog
        open={!!runToCancel}
        title="Cancel Agent Run?"
        description="Are you sure you want to cancel this Agent run? Any running tests or scanning jobs will be aborted."
        confirmLabel="Confirm Cancel Run"
        cancelLabel="Keep Running"
        variant="warning"
        onConfirm={() => handleConfirmCancel(runToCancel!)}
        onCancel={() => setRunToCancel(null)}
      />
    </div>
  )
}
