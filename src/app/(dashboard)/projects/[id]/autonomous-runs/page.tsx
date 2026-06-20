"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
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
  Gauge
} from "lucide-react"

interface Project {
  id: string
  name: string
  webAppUrl: string
}

interface AutonomousAgentRun {
  id: string
  status: "Queued" | "Analyzing" | "Generating" | "Executing" | "Reporting" | "Completed" | "Failed" | "Cancelled"
  mode: "Fast" | "Balanced" | "Full"
  safetyDoNotDelete: boolean
  safetyDoNotModify: boolean
  summary: string | null
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
}

export default function AutonomousAgentDashboardPage() {
  const params = useParams()
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<AutonomousAgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  // Configure settings
  const [selectedMode, setSelectedMode] = useState<"Fast" | "Balanced" | "Full">("Balanced")
  const [safetyDoNotDelete, setSafetyDoNotDelete] = useState(true)
  const [safetyDoNotModify, setSafetyDoNotModify] = useState(false)

  useEffect(() => {
    fetchProjectAndRuns()
  }, [params.id])

  async function fetchProjectAndRuns() {
    try {
      const projRes = await fetch(`/api/projects/${params.id}`)
      const projData = await projRes.json()
      setProject(projData.project)

      const runsRes = await fetch(`/api/projects/${params.id}/autonomous-runs`)
      const runsData = await runsRes.json()
      setRuns(runsData.runs || [])
    } catch (err) {
      console.error("Failed to load project details or runs:", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleTriggerRun() {
    setTriggering(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/autonomous-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          safetyDoNotDelete,
          safetyDoNotModify,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const newRun = data.agentRun
        // Automatically navigate to the new run's telemetry page
        router.push(`/projects/${params.id}/autonomous-runs/${newRun.id}`)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(errorData.error || "Failed to trigger autonomous QA Agent run.")
      }
    } catch (err) {
      console.error(err)
      alert("Network error starting agent run.")
    } finally {
      setTriggering(false)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "Queued":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-350">
            <Clock className="h-3 w-3 animate-pulse text-slate-500" /> Queued
          </span>
        )
      case "Analyzing":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
            <Activity className="h-3 w-3 animate-spin text-blue-500" /> Analyzing DOM
          </span>
        )
      case "Generating":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <Sparkles className="h-3 w-3 animate-pulse text-amber-500" /> AI Generating
          </span>
        )
      case "Executing":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">
            <RefreshCw className="h-3 w-3 animate-spin text-indigo-500" /> Testing App
          </span>
        )
      case "Reporting":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400">
            <Zap className="h-3 w-3 animate-pulse text-violet-500" /> Writing Summary
          </span>
        )
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-450">
            <CheckCircle className="h-3 w-3 text-emerald-500" /> Completed
          </span>
        )
      case "Failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
            <AlertTriangle className="h-3 w-3 text-rose-500" /> Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
            {status}
          </span>
        )
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-650" />
        <p className="text-sm text-muted-foreground font-semibold">Loading Autonomous QA Engine...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive font-bold text-lg">Project not found</p>
        <Link href="/projects" className="text-indigo-600 hover:underline mt-2 inline-block">Back to Projects</Link>
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
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Autonomous QA Agent</h1>
              <span className="px-2 py-0.5 text-[10px] font-black tracking-wider uppercase bg-indigo-50 dark:bg-indigo-950/50 text-indigo-650 dark:text-indigo-400 rounded border border-indigo-100/50 dark:border-indigo-900/50">Autonomous Mode</span>
            </div>
            <p className="text-sm text-slate-500 font-semibold mt-1.5">
              Project: <span className="text-slate-800 dark:text-slate-200 font-bold">{project.name}</span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchProjectAndRuns}
          className="flex items-center gap-1.5 rounded-xl text-xs font-semibold h-9"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Runs
        </Button>
      </div>

      {/* Two-Column Setup Interface */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Run Configuration (Left Card) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-6">
            <div className="flex items-center gap-2 border-b pb-3.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-xl">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">Configure Agent Search Range</h3>
                <p className="text-xs text-slate-500 font-medium">Select agent runtime mode, depth, and actions coverage settings</p>
              </div>
            </div>

            {/* Mode selection cards */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Select Run Mode Depth</label>
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Fast Mode */}
                <div
                  onClick={() => setSelectedMode("Fast")}
                  className={`cursor-pointer p-4 rounded-xl border transition-all relative ${
                    selectedMode === "Fast"
                      ? "border-indigo-600 bg-indigo-50/20 dark:border-indigo-500 dark:bg-indigo-950/20 ring-2 ring-indigo-600/10"
                      : "border-slate-200/80 hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 bg-background"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-455">Fast Mode</span>
                    {selectedMode === "Fast" && <div className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                  </div>
                  <h4 className="text-xl font-black mt-2 text-slate-850 dark:text-slate-100">2 Tests</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Smoke tests focused on core homepage loading and main navigation links verification.
                  </p>
                  <div className="mt-3 text-[10px] font-bold text-indigo-650 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-2 py-0.5 rounded inline-block">
                    ~1-2 minutes
                  </div>
                </div>

                {/* Balanced Mode */}
                <div
                  onClick={() => setSelectedMode("Balanced")}
                  className={`cursor-pointer p-4 rounded-xl border transition-all relative ${
                    selectedMode === "Balanced"
                      ? "border-indigo-600 bg-indigo-50/20 dark:border-indigo-500 dark:bg-indigo-950/20 ring-2 ring-indigo-600/10"
                      : "border-slate-200/80 hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 bg-background"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-455">Balanced</span>
                    {selectedMode === "Balanced" && <div className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                  </div>
                  <h4 className="text-xl font-black mt-2 text-slate-850 dark:text-slate-100">4 Tests</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Scans interactive buttons, selects, and input fields to verify standard app workflows.
                  </p>
                  <div className="mt-3 text-[10px] font-bold text-indigo-650 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-2 py-0.5 rounded inline-block">
                    ~3-4 minutes
                  </div>
                </div>

                {/* Full Mode */}
                <div
                  onClick={() => setSelectedMode("Full")}
                  className={`cursor-pointer p-4 rounded-xl border transition-all relative ${
                    selectedMode === "Full"
                      ? "border-indigo-600 bg-indigo-50/20 dark:border-indigo-500 dark:bg-indigo-950/20 ring-2 ring-indigo-600/10"
                      : "border-slate-200/80 hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 bg-background"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-455">Full depth</span>
                    {selectedMode === "Full" && <div className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                  </div>
                  <h4 className="text-xl font-black mt-2 text-slate-850 dark:text-slate-100">6 Tests</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Deep crawl to search secondary dynamic routes, form fields, and nested components.
                  </p>
                  <div className="mt-3 text-[10px] font-bold text-indigo-650 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-2 py-0.5 rounded inline-block">
                    ~5-6 minutes
                  </div>
                </div>
              </div>
            </div>

            {/* Run Button */}
            <div className="pt-2 border-t">
              <Button
                className="w-full bg-gradient-to-r from-indigo-650 to-violet-650 hover:from-indigo-700 hover:to-violet-700 text-white font-bold h-11 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                onClick={handleTriggerRun}
                disabled={triggering}
              >
                {triggering ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Enqueuing Agent Job...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white text-white" />
                    Launch Autonomous QA Agent Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Safety & Sandbox Controls (Right Card) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-5">
            <div className="flex items-center gap-2 border-b pb-3.5">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-650 dark:text-rose-455 rounded-xl">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-slate-50">Safety Sandbox Guards</h3>
                <p className="text-[11px] text-slate-500">Protect databases from destructive automated AI clicks</p>
              </div>
            </div>

            {/* Guard 1 */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-xl border bg-slate-50/40 dark:bg-slate-850/40">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 fill-emerald-50 dark:fill-none" />
                  Do Not Delete Data
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Blocks steps matching terms like <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">delete</span>, <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">remove</span>, or <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">cancel_account</span>.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyDoNotDelete}
                onChange={(e) => setSafetyDoNotDelete(e.target.checked)}
                className="h-4 w-4 text-indigo-650 border-slate-300 rounded focus:ring-indigo-500 mt-1 cursor-pointer"
              />
            </div>

            {/* Guard 2 */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-xl border bg-slate-50/40 dark:bg-slate-850/40">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500 fill-amber-50 dark:fill-none" />
                  Do Not Modify Settings
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Blocks actions targeting settings edits, payments checkout buttons, or user profile modifications.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyDoNotModify}
                onChange={(e) => setSafetyDoNotModify(e.target.checked)}
                className="h-4 w-4 text-indigo-650 border-slate-300 rounded focus:ring-indigo-500 mt-1 cursor-pointer"
              />
            </div>

            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/50 rounded-xl text-[10px] text-indigo-700 dark:text-indigo-400 font-medium leading-relaxed">
              <strong>Info:</strong> When a safety guard triggers, the worker skips that Playwright step, marks it as <span className="font-semibold text-slate-800 dark:text-slate-150">Skipped</span> in logs, and adds a warning instead of failing the execution run.
            </div>
          </div>
        </div>
      </div>

      {/* Execution History */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-400" /> Agent Execution History
        </h3>

        {runs.length === 0 ? (
          <div className="text-center border border-slate-200 dark:border-slate-800 rounded-2xl py-12 bg-white dark:bg-slate-900 shadow-sm">
            <History className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">No agent sessions triggered</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1.5">
              Launch a new autonomous agent session above to crawl this application, auto-generate tests, and find bugs.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-md bg-white dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">Run ID / Created</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">Mode</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">Guards Active</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">Metrics</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider">Duration</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider text-right">Details</th>
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
                          run.mode === "Fast" ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/20 dark:text-cyan-400" :
                          run.mode === "Balanced" ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400" :
                          "bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400"
                        }`}>
                          {run.mode}
                        </span>
                      </td>
                      <td className="p-4">{getStatusBadge(run.status)}</td>
                      <td className="p-4">
                        <div className="flex gap-1.5">
                          {run.safetyDoNotDelete && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-450 px-2 py-0.5 rounded border border-emerald-100/50 dark:border-emerald-900/50" title="Delete protection active">
                              NO_DEL
                            </span>
                          )}
                          {run.safetyDoNotModify && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-450 px-2 py-0.5 rounded border border-amber-100/50 dark:border-amber-900/50" title="Modify protection active">
                              NO_MOD
                            </span>
                          )}
                          {!run.safetyDoNotDelete && !run.safetyDoNotModify && (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500 px-2 py-0.5 rounded">
                              None
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        {run.metrics ? (
                          <div className="flex gap-3 text-xs">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Pass: <strong className="font-extrabold">{run.metrics.passCount ?? 0}</strong>
                            </span>
                            <span className="font-semibold text-rose-600 dark:text-rose-455">
                              Fail: <strong className="font-extrabold">{run.metrics.failCount ?? 0}</strong>
                            </span>
                            {run.metrics.selfHealedCount && run.metrics.selfHealedCount > 0 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">
                                Healed: <strong className="font-extrabold">{run.metrics.selfHealedCount}</strong>
                              </span>
                            ) : null}
                            {run.metrics.bugCount && run.metrics.bugCount > 0 ? (
                              <span className="font-semibold text-red-500 flex items-center gap-0.5 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded">
                                <Bug className="h-3 w-3 text-red-500" /> {run.metrics.bugCount}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-slate-600 dark:text-slate-400 text-xs">
                        {run.status === "Completed" || run.status === "Failed" ? (
                          run.metrics?.totalDurationMs ? (
                            formatDuration(run.metrics.totalDurationMs)
                          ) : (
                            formatDuration(run.startedAt && run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime() : undefined)
                          )
                        ) : (
                          <span className="text-slate-400">Running...</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <Link href={`/projects/${project.id}/autonomous-runs/${run.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/50 dark:text-indigo-400 dark:hover:bg-slate-800/80 rounded-xl"
                          >
                            View Telemetry <ExternalLink className="h-3.5 w-3.5 ml-1" />
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
    </div>
  )
}
