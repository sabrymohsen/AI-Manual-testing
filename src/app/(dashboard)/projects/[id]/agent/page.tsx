"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  BookOpen,
  HelpCircle,
  Sparkles,
  Info
} from "lucide-react"

interface Project {
  id: string
  name: string
  webAppUrl: string
}

interface Credential {
  id: string
  roleName: string
  username: string
}

interface QAAgentRun {
  id: string
  status: string
  mode: string
  goal: string
  safetyLevel: string
  createdAt: string
}

export default function QAAgentDashboardPage() {
  const params = useParams()
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [runs, setRuns] = useState<QAAgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [diagnostics, setDiagnostics] = useState<{
    workerOnline: boolean
    queueName: string
    waitingJobs: number
    activeJobs: number
    failedJobs: number
    lastHeartbeatAt: string | null
  } | null>(null)

  // Onboarding Step state
  const [isOnboarded, setIsOnboarded] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(true)

  // Form states
  const [goal, setGoal] = useState("Generate and run smoke tests")
  const [scope, setScope] = useState("Entire project")
  const [mode, setMode] = useState("Autonomous")
  const [credentialId, setCredentialId] = useState("")
  const [browserType, setBrowserType] = useState("Chromium")
  const [viewport, setViewport] = useState("1280x800")
  const [safetyLevel, setSafetyLevel] = useState("ReadOnly")
  
  // Advanced Settings
  const [maxPages, setMaxPages] = useState("10")
  const [maxTests, setMaxTests] = useState("10")
  const [maxTime, setMaxTime] = useState("10")

  useEffect(() => {
    fetchDashboardData()
  }, [params.id])

  async function fetchDashboardData() {
    try {
      const projRes = await fetch(`/api/projects/${params.id}`)
      if (projRes.ok) {
        const data = await projRes.json()
        setProject(data.project)
      }

      const credRes = await fetch(`/api/projects/${params.id}/credentials`)
      if (credRes.ok) {
        const data = await credRes.json()
        setCredentials(data.credentials || [])
      }

      const runsRes = await fetch(`/api/projects/${params.id}/agent/runs`)
      if (runsRes.ok) {
        const data = await runsRes.json()
        setRuns(data.runs || [])
      }

      const statusRes = await fetch(`/api/projects/${params.id}/agent/status`)
      if (statusRes.ok) {
        const data = await statusRes.json()
        setDiagnostics(data)
      }
    } catch (err) {
      console.error("Failed to load QA Agent dashboard details:", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleTriggerRun() {
    setTriggering(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/agent/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          goal,
          scope: { type: scope, maxPages: parseInt(maxPages), maxTests: parseInt(maxTests), maxTime: parseInt(maxTime) },
          safetyLevel,
          credentialId: credentialId || null,
          browserType,
          viewport
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const newRun = data.agentRun
        router.push(`/projects/${params.id}/agent/runs/${newRun.id}`)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(errorData.error || "Failed to trigger QA Agent Brain run.")
      }
    } catch {
      alert("Network error starting QA Agent run.")
    } finally {
      setTriggering(false)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "Queued":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Queued</span>
      case "Scanning":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400">Scanning UI</span>
      case "Planning":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400">Planning Tests</span>
      case "WaitingForApproval":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400">Waiting for Approval</span>
      case "Running":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 animate-pulse">Running Steps</span>
      case "Reporting":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-violet-50 text-violet-700 dark:bg-violet-955/20 dark:text-violet-400">Generating Report</span>
      case "Completed":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">Completed</span>
      case "Failed":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400">Failed</span>
      case "Cancelled":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-500">Cancelled</span>
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-500">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm text-muted-foreground font-semibold">Loading QA Agent Brain...</p>
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
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">QA Agent Brain</h1>
              <span className="px-2.5 py-0.5 text-[10px] font-black tracking-wider uppercase bg-indigo-600 text-white rounded-md">Local-First</span>
            </div>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Autonomous and Guided QA validation for: <span className="text-slate-850 dark:text-slate-200 font-bold">{project.name}</span>
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboardData} className="flex items-center gap-1.5 rounded-xl text-xs font-semibold h-9">
          <RefreshCw className="h-3.5 w-3.5" /> Force Sync
        </Button>
      </div>

      {/* 1. Onboarding Panel */}
      {!isOnboarded && (
        <div className="p-6 border border-indigo-150 dark:border-indigo-950/80 rounded-2xl bg-indigo-50/20 dark:bg-indigo-950/5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-indigo-650 animate-bounce" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">What is QA Agent Brain?</h3>
          </div>
          <p className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-semibold">
            QA Agent Brain is your automated local testing assistant. It analyzes your target application under test,
            plans scenarios, executes them in isolated browser contexts, handles broken element healing, and logs defects automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 text-xs font-medium text-slate-600 dark:text-slate-350">
            <div className="flex items-center gap-2 bg-background p-3 rounded-xl border border-slate-100"><Sparkles className="h-4 w-4 text-amber-500" /> Free local-first generation</div>
            <div className="flex items-center gap-2 bg-background p-3 rounded-xl border border-slate-100"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Safe Read-Only options</div>
            <div className="flex items-center gap-2 bg-background p-3 rounded-xl border border-slate-100"><Activity className="h-4 w-4 text-purple-500" /> Screenshot & evidence logs</div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => { setMode("Guided"); setIsOnboarded(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs">Start Guided Mode</Button>
            <Button size="sm" variant="outline" onClick={() => setShowHowItWorks(!showHowItWorks)} className="rounded-xl text-xs font-semibold">How It Works</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsOnboarded(true)} className="rounded-xl text-xs font-semibold text-slate-500">Dismiss</Button>
          </div>
        </div>
      )}

      {/* 2. Visual "How It Works" Flow */}
      {showHowItWorks && (
        <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> How QA Agent Brain Works</h3>
          <div className="grid gap-4 sm:grid-cols-5 text-xs">
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
              <span className="font-bold text-indigo-600">1. Understand</span>
              <p className="text-[10px] text-slate-500 mt-1">The agent scans your target project URL, credentials, pages, and interactive UI controls.</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
              <span className="font-bold text-purple-600">2. Plan</span>
              <p className="text-[10px] text-slate-500 mt-1">The agent formulates rule-based smoke tests, authentication tests, search inputs, and form validation checks.</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
              <span className="font-bold text-indigo-600">3. Execute</span>
              <p className="text-[10px] text-slate-500 mt-1">The agent runs the steps sequentially using Playwright in an isolated browser environment.</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
              <span className="font-bold text-amber-600">4. Heal</span>
              <p className="text-[10px] text-slate-500 mt-1">If an element is missed, the Smart Locator and Self-Healing layer resolves fallback paths.</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
              <span className="font-bold text-emerald-600">5. Report</span>
              <p className="text-[10px] text-slate-500 mt-1">The agent logs screenshots, findings, and autogenerates defect reports for any failures.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Form & Options */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 border-b pb-3">Agent Workspace Setup</h3>
            
            {/* Goal */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Agent Goal</label>
                <span title="Choose what you want the QA Agent to do. Start with 'Analyze application only' if this is your first time." className="text-slate-400 cursor-help"><HelpCircle className="h-3.5 w-3.5" /></span>
              </div>
              <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-background">
                <option value="Analyze application only">Analyze application only</option>
                <option value="Generate test cases only">Generate test cases only</option>
                <option value="Generate and run smoke tests">Generate and run smoke tests</option>
                <option value="Run existing tests">Run existing tests</option>
                <option value="Find bugs automatically">Find bugs automatically</option>
                <option value="Explore app and suggest tests">Explore app and suggest tests</option>
              </select>
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Execution Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-background">
                <option value="Entire project">Entire project</option>
                <option value="Specific module">Specific module</option>
                <option value="Specific feature">Specific feature</option>
                <option value="Specific component">Specific component</option>
              </select>
            </div>

            {/* Mode selection cards */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Select Mode</label>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { id: "Guided", title: "Guided Mode", desc: "User chooses what the agent should do. Recommended for beginners." },
                  { id: "SemiAutonomous", title: "Semi-Autonomous", desc: "Agent suggests planned tests, but user must approve before execution." },
                  { id: "Autonomous", title: "Autonomous Mode", desc: "Scan, plan, execute, heal, and report fully automatically." }
                ].map((modeItem) => (
                  <div
                    key={modeItem.id}
                    onClick={() => setMode(modeItem.id)}
                    className={`cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                      mode === modeItem.id
                        ? "border-indigo-600 bg-indigo-50/10 dark:border-indigo-500 dark:bg-indigo-950/20 ring-2 ring-indigo-650/10"
                        : "border-slate-200 hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 bg-background"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-black uppercase text-indigo-650 dark:text-indigo-400">{modeItem.title}</span>
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{modeItem.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced configurations */}
            <div className="grid gap-4 sm:grid-cols-3 pt-3 border-t">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Max Pages to Scan</label>
                <Input type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} className="rounded-xl h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Max Tests to Gen</label>
                <Input type="number" value={maxTests} onChange={(e) => setMaxTests(e.target.value)} className="rounded-xl h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Max Execution Time (Min)</label>
                <Input type="number" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="rounded-xl h-9" />
              </div>
            </div>

            {/* Start execution button */}
            <div className="pt-4 border-t">
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-850 text-white font-bold h-11 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                onClick={handleTriggerRun}
                disabled={triggering}
              >
                {triggering ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Dispatching QA Agent...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white text-white" /> Start QA Agent Brain
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Safety & Environment Sidebar */}
        <div className="space-y-6">
          {/* Safety Settings Card */}
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
            <div className="flex items-center gap-2 border-b pb-3.5">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-650 rounded-xl">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h3 className="text-sm font-bold text-slate-950 dark:text-slate-50">Safety Sandbox Profiles</h3>
                  <span title="Safety level controls what the agent is allowed to do. Read-only mode prevents data changes." className="text-slate-400 cursor-help"><HelpCircle className="h-3.5 w-3.5" /></span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { id: "ReadOnly", title: "Safe Read-Only", desc: "No clicks or inputs. Validates pages via static checks and screenshots." },
                { id: "AllowFormFill", title: "Form-Fill Only", desc: "Allows filling fields, but blocks clicks that trigger submissions." },
                { id: "AllowCreateUpdate", title: "Create & Update", desc: "Allows standard CRUD execution. Blocks delete/wipe triggers." },
                { id: "AllowDestructiveWithConfirmation", title: "Allow Destructive", desc: "Enables destructive keyword steps (requires manual override)." }
              ].map((level) => (
                <div
                  key={level.id}
                  onClick={() => setSafetyLevel(level.id)}
                  className={`cursor-pointer p-3 rounded-xl border text-xs flex flex-col gap-1 transition-all ${
                    safetyLevel === level.id
                      ? "border-rose-500 bg-rose-50/10 dark:border-rose-500/80 dark:bg-rose-950/10 ring-2 ring-rose-500/5"
                      : "border-slate-100 hover:border-slate-250 bg-slate-50/20"
                  }`}
                >
                  <span className="font-bold text-slate-850 dark:text-slate-250">{level.title}</span>
                  <p className="text-[10px] text-slate-450 leading-relaxed">{level.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Credentials selector card */}
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 border-b pb-3">Session Context</h3>
            
            {/* Roles */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Role / Credential</label>
              {credentials.length === 0 ? (
                <div className="p-3 bg-amber-50/30 border border-dashed rounded-xl text-[10px] text-slate-500">
                  No credentials found. The agent can still test public pages. Add credentials if you want to test logged-in flows.
                </div>
              ) : (
                <select value={credentialId} onChange={(e) => setCredentialId(e.target.value)} className="w-full text-xs p-2.5 rounded-xl border bg-background">
                  <option value="">Public Sandbox (No Login)</option>
                  {credentials.map(c => (
                    <option key={c.id} value={c.id}>{c.roleName} ({c.username})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Browser */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Browser Context</label>
              <select value={browserType} onChange={(e) => setBrowserType(e.target.value)} className="w-full text-xs p-2.5 rounded-xl border bg-background">
                <option value="Chromium">Chromium (Default)</option>
                <option value="Firefox">Firefox</option>
                <option value="WebKit">WebKit (Safari engine)</option>
              </select>
            </div>
          </div>

          {/* Queue Diagnostics Card */}
          {diagnostics && (
            <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 shadow-md space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 border-b pb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-500" /> Queue Diagnostics
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-semibold">Worker Status</span>
                  <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${
                    diagnostics.workerOnline 
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" 
                      : "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400"
                  }`}>
                    {diagnostics.workerOnline ? "Online" : "Offline"}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-semibold">Queue Status</span>
                  <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${
                    diagnostics.activeJobs > 0 ? "bg-amber-50 text-amber-705 animate-pulse" : "bg-slate-100 text-slate-650"
                  }`}>
                    {diagnostics.activeJobs > 0 ? "Active" : diagnostics.waitingJobs > 0 ? "Waiting" : "Idle"}
                  </span>
                </div>

                {diagnostics.lastHeartbeatAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">Last Heartbeat</span>
                    <span className="text-slate-650 font-bold dark:text-slate-350">
                      {new Date(diagnostics.lastHeartbeatAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}

                <div className="border-t border-dashed my-2 pt-2 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-450 font-semibold">Active Agent Jobs</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{diagnostics.activeJobs}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-450 font-semibold">Waiting Agent Jobs</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{diagnostics.waitingJobs}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-450 font-semibold">Failed Agent Jobs</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{diagnostics.failedJobs}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Free Heuristic Status Info Card */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/20 text-xs flex gap-2.5 items-start">
            <Info className="h-4 w-4 text-indigo-500 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-800">Free Rule-Based Mode Active</span>
              <p className="text-[10px] text-slate-450 leading-relaxed">No paid external AI key configured. Scenario planning runs locally using structural scan heuristic rules.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Sessions table */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-400" /> QA Agent Runs History
        </h3>

        {runs.length === 0 ? (
          <div className="text-center border rounded-2xl py-12 bg-white dark:bg-slate-900 shadow-sm">
            <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">No agent sessions triggered</h4>
            <p className="text-xs text-slate-450 max-w-xs mx-auto mt-1.5">
              Select your settings above and trigger the QA Agent Brain to scan layout components.
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
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Goal</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Safety</th>
                    <th className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wide">Status</th>
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
                        <span className="inline-block text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20">
                          {run.mode}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-semibold text-slate-500">{run.goal}</td>
                      <td className="p-4">
                        <span className="text-xs font-bold text-rose-600">{run.safetyLevel}</span>
                      </td>
                      <td className="p-4">{getStatusBadge(run.status)}</td>
                      <td className="p-4 text-right">
                        <Link href={`/projects/${project.id}/agent/runs/${run.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-bold text-indigo-650 hover:text-indigo-700 rounded-xl"
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
    </div>
  )
}
