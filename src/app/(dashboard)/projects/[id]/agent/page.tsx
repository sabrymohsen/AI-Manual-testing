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
  const [runToCancel, setRunToCancel] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [diagnostics, setDiagnostics] = useState<{
    workerOnline: boolean
    queueName: string
    waitingJobs: number
    activeJobs: number
    failedJobs: number
    lastHeartbeatAt: string | null
    playwrightInstalled?: boolean
    targetUrlValid?: boolean
    aiProviderStatus?: string
  } | null>(null)

  // Onboarding Step state
  const [isOnboarded, setIsOnboarded] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(true)

  // Form states
  const [goal, setGoal] = useState("Test login and scan dashboard")
  const [scope, setScope] = useState("Entire project")
  const [mode, setMode] = useState("Autonomous")
  const [credentialId, setCredentialId] = useState("")
  const [browserType, setBrowserType] = useState("Chromium")
  const [viewport, setViewport] = useState("1280x800")
  const [safetyLevel, setSafetyLevel] = useState("ReadOnly")
  
  // Custom Setup Form states
  const [targetUrl, setTargetUrl] = useState("")
  const [environment, setEnvironment] = useState("Development")
  const [scanDepth, setScanDepth] = useState("Medium")
  const [showNoCredsWarning, setShowNoCredsWarning] = useState(false)

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
        if (data.project?.webAppUrl) {
          setTargetUrl(data.project.webAppUrl)
        }
      }

      const credRes = await fetch(`/api/projects/${params.id}/credentials`)
      if (credRes.ok) {
        const data = await credRes.json()
        const credsList = data.credentials || []
        setCredentials(credsList)
        if (credsList.length === 0) {
          setShowNoCredsWarning(true)
        } else {
          setShowNoCredsWarning(false)
        }
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
          scope: { 
            type: scope, 
            maxPages: parseInt(maxPages), 
            maxTests: parseInt(maxTests), 
            maxTime: parseInt(maxTime),
            targetUrl,
            environment,
            scanDepth
          },
          safetyLevel,
          credentialId: credentialId || null,
          browserType,
          viewport,
          targetUrl,
          environment
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const runId = data.agentRunId || data.agentRun?.id
        router.push(`/projects/${params.id}/agent/runs/${runId}`)
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

  async function handleConfirmCancel(runId: string) {
    const res = await fetch(`/api/agent/runs/${runId}/cancel`, {
      method: "POST"
    })
    if (res.ok) {
      setRunToCancel(null)
      const runsRes = await fetch(`/api/projects/${params.id}/agent/runs`)
      if (runsRes.ok) {
        const data = await runsRes.json()
        setRuns(data.runs || [])
      }
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || "Failed to cancel run")
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
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-muted text-muted-foreground">Cancelled</span>
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-muted text-muted-foreground">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-semibold">Loading QA Agent Brain...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive font-semibold text-lg">Project not found</p>
        <Link href="/projects" className="text-indigo-650 hover:underline mt-2 inline-block">Back to Projects</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${project.id}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-border dark:border-slate-800 bg-background hover:bg-muted/50">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground dark:text-slate-50">QA Agent Brain</h1>
              <span className="px-2.5 py-0.5 text-[11px] font-medium bg-primary text-white rounded-md">Local-First</span>
            </div>
            <p className="text-sm text-muted-foreground font-semibold mt-1">
              Autonomous and Guided QA validation for: <span className="text-slate-850 dark:text-slate-200 font-semibold">{project.name}</span>
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboardData} className="flex items-center gap-1.5 rounded-xl text-xs font-semibold h-9">
          <RefreshCw className="h-3.5 w-3.5" /> Force Sync
        </Button>
      </div>

      {/* 1. Onboarding Panel */}
      {!isOnboarded && (
        <div className="p-6 border border-indigo-150 dark:border-indigo-950/80 rounded-xl bg-indigo-50/20 dark:bg-indigo-950/5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-indigo-650 animate-bounce" />
            <h3 className="text-lg font-semibold text-foreground dark:text-slate-50">What is QA Agent Brain?</h3>
          </div>
          <p className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-semibold">
            QA Agent Brain helps you analyze your web app like a QA engineer. It can open your app, detect login pages, use saved project credentials, test the login flow, scan authenticated pages, generate test cases, capture evidence, and report issues.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 text-xs font-medium text-muted-foreground dark:text-slate-350">
            <div className="flex items-center gap-2 bg-background p-3 rounded-xl border border-border"><Sparkles className="h-4 w-4 text-amber-500" /> Free local-first generation</div>
            <div className="flex items-center gap-2 bg-background p-3 rounded-xl border border-border"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Safe Read-Only options</div>
            <div className="flex items-center gap-2 bg-background p-3 rounded-xl border border-border"><Activity className="h-4 w-4 text-purple-500" /> Screenshot & evidence logs</div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => { setMode("Guided"); setIsOnboarded(true); }} className="bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs">Start Guided Mode</Button>
            <Button size="sm" variant="outline" onClick={() => setShowHowItWorks(!showHowItWorks)} className="rounded-xl text-xs font-semibold">How It Works</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsOnboarded(true)} className="rounded-xl text-xs font-semibold text-muted-foreground">Dismiss</Button>
          </div>
        </div>
      )}

      {/* 2. Visual "How It Works" Flow */}
      {showHowItWorks && (
        <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> How QA Agent Brain Works</h3>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-7 text-xs">
            <div className="p-4 rounded-xl border border-border bg-muted/30">
              <span className="font-semibold text-primary">1. Open App</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Launches the target project URL in an automated browser.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30">
              <span className="font-semibold text-purple-600">2. Detect Login</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Identifies login/sign-in entry points and modals.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30">
              <span className="font-semibold text-amber-600">3. Use Credentials</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Extracts saved credentials from Project Settings.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30">
              <span className="font-semibold text-rose-600">4. Verify Login</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Fills fields, clicks submit and verifies login success.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30">
              <span className="font-semibold text-emerald-600">5. Scan Pages</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Explores dashboard layouts and safe interactive controls.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30">
              <span className="font-semibold text-blue-600">6. Generate Tests</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Constructs structured rule-based test plans.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30 col-span-2 md:col-span-1">
              <span className="font-semibold text-foreground dark:text-slate-300">7. Report Findings</span>
              <p className="text-[10px] text-slate-550 dark:text-slate-450 mt-1">Logs console/network errors, screenshots, and generates reports.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Form & Options */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Credentials Warning Card */}
          {showNoCredsWarning && (
            <div className="p-5 border border-amber-250 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-955/5 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in slide-in-from-top duration-300">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-200">No credentials found for this project</h4>
                  <p className="text-xs text-amber-650 dark:text-amber-400 mt-1 leading-relaxed font-semibold">
                    QA Agent Brain can still scan public pages, but login testing requires credentials.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/projects/${project.id}`}>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-xs">
                    Add Credentials
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCredentialId("");
                    setShowNoCredsWarning(false);
                  }}
                  className="rounded-xl text-xs font-semibold border-amber-200 hover:bg-amber-50/50"
                >
                  Continue Public Scan
                </Button>
              </div>
            </div>
          )}

          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-900 shadow-md space-y-6">
            <div className="flex justify-between items-center border-b pb-3 flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-foreground dark:text-slate-50">Agent Workspace Setup</h3>
              <span className="px-2.5 py-1 text-xs font-black rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 border border-indigo-200">
                {diagnostics?.aiProviderStatus === "AI Mode Configured" ? "Mode: Local AI Assisted" : "Mode: Free Rule-Based Mode"}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Target URL */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Target URL</label>
                <Input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="e.g. http://localhost:3000"
                  className="rounded-xl h-10 text-xs"
                />
              </div>

              {/* Environment */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Environment</label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                >
                  <option value="Development">Development</option>
                  <option value="Staging">Staging</option>
                  <option value="Production">Production</option>
                </select>
              </div>

              {/* Credential / Role */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Credential / Role</label>
                {credentials.length === 0 ? (
                  <select disabled className="w-full text-xs p-2.5 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400">
                    <option value="">Public Sandbox (No Login)</option>
                  </select>
                ) : (
                  <select
                    value={credentialId}
                    onChange={(e) => setCredentialId(e.target.value)}
                    className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                  >
                    <option value="">Public Sandbox (No Login)</option>
                    {credentials.map(c => (
                      <option key={c.id} value={c.id}>{c.roleName} ({c.username})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Goal */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Goal</label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                >
                  <option value="Analyze public page only">Analyze public page only</option>
                  <option value="Test login flow">Test login flow</option>
                  <option value="Test login and scan dashboard">Test login and scan dashboard</option>
                  <option value="Generate test plan only">Generate test plan only</option>
                  <option value="Generate and save test cases">Generate and save test cases</option>
                  <option value="Find UI/functional issues">Find UI/functional issues</option>
                </select>
              </div>

              {/* Scan Depth */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Scan Depth</label>
                <select
                  value={scanDepth}
                  onChange={(e) => setScanDepth(e.target.value)}
                  className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                >
                  <option value="Shallow">Shallow (1 level)</option>
                  <option value="Medium">Medium (2-3 levels)</option>
                  <option value="Deep">Deep (4+ levels)</option>
                </select>
              </div>

              {/* Browser */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Browser</label>
                <select
                  value={browserType}
                  onChange={(e) => setBrowserType(e.target.value)}
                  className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                >
                  <option value="Chromium">Chromium (Default)</option>
                  <option value="Firefox">Firefox</option>
                  <option value="WebKit">WebKit (Safari engine)</option>
                </select>
              </div>

              {/* Viewport */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Viewport</label>
                <select
                  value={viewport}
                  onChange={(e) => setViewport(e.target.value)}
                  className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                >
                  <option value="1280x800">Desktop (1280x800)</option>
                  <option value="1920x1080">Full HD Desktop (1920x1080)</option>
                  <option value="768x1024">Tablet (768x1024)</option>
                  <option value="375x812">Mobile (375x812)</option>
                </select>
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Execution Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full text-xs p-2.5 h-10 rounded-xl border border-border dark:border-slate-800 bg-background"
                >
                  <option value="Entire project">Entire project</option>
                  <option value="Specific module">Specific module</option>
                  <option value="Specific feature">Specific feature</option>
                  <option value="Specific component">Specific component</option>
                </select>
              </div>
            </div>

            {/* Mode selection cards */}
            <div className="space-y-3 pt-3 border-t">
              <label className="text-xs font-medium text-muted-foreground">Select Mode</label>
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
                        : "border-border hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 bg-background"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-semibold uppercase text-indigo-650 dark:text-indigo-400">{modeItem.title}</span>
                      <p className="text-[10px] text-slate-550 mt-1.5 leading-relaxed font-semibold">{modeItem.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced configurations */}
            <div className="grid gap-4 sm:grid-cols-3 pt-3 border-t">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">Max Pages to Scan</label>
                <Input type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} className="rounded-xl h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">Max Tests to Gen</label>
                <Input type="number" value={maxTests} onChange={(e) => setMaxTests(e.target.value)} className="rounded-xl h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">Max Execution Time (Min)</label>
                <Input type="number" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="rounded-xl h-9 text-xs" />
              </div>
            </div>

            {/* Start execution button */}
            <div className="pt-4 border-t">
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-850 text-white font-semibold h-11 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
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
          <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-900 shadow-md space-y-4">
            <div className="flex items-center gap-2 border-b pb-3.5">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-650 rounded-xl">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Safety Sandbox Profiles</h3>
                  <span title="Safety level controls what the agent is allowed to do. Read-only mode prevents data changes." className="text-muted-foreground cursor-help"><HelpCircle className="h-3.5 w-3.5" /></span>
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
                      : "border-border hover:border-slate-250 bg-muted/20"
                  }`}
                >
                  <span className="font-semibold text-slate-850 dark:text-slate-250">{level.title}</span>
                  <p className="text-[10px] text-slate-450 leading-relaxed">{level.desc}</p>
                </div>
              ))}
            </div>
          </div>



          {/* Queue Diagnostics Card */}
          {diagnostics && (
            <div className="p-6 border border-slate-200/80 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-900 shadow-md space-y-4">
              <h3 className="text-sm font-semibold text-foreground dark:text-slate-50 border-b pb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Queue Diagnostics
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Worker Status</span>
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase ${
                    diagnostics.workerOnline 
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" 
                      : "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400"
                  }`}>
                    {diagnostics.workerOnline ? "Online" : "Offline"}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Queue Status</span>
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase ${
                    diagnostics.activeJobs > 0 ? "bg-amber-50 text-amber-705 animate-pulse" : "bg-muted text-slate-650"
                  }`}>
                    {diagnostics.activeJobs > 0 ? "Active" : diagnostics.waitingJobs > 0 ? "Waiting" : "Idle"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Playwright Status</span>
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase ${
                    diagnostics.playwrightInstalled 
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" 
                      : "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400"
                  }`}>
                    {diagnostics.playwrightInstalled ? "Installed" : "Missing"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Target URL Validity</span>
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase ${
                    diagnostics.targetUrlValid 
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" 
                      : "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400"
                  }`}>
                    {diagnostics.targetUrlValid ? "Valid" : "Invalid"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">AI Provider Status</span>
                  <span className="px-2 py-0.5 rounded font-medium text-[11px] bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-300">
                    {diagnostics.aiProviderStatus || "Free Rule-Based Mode"}
                  </span>
                </div>

                {diagnostics.lastHeartbeatAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">Last Heartbeat</span>
                    <span className="text-slate-650 font-semibold dark:text-slate-350">
                      {new Date(diagnostics.lastHeartbeatAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}

                <div className="border-t border-dashed my-2 pt-2 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-450 font-semibold">Active Agent Jobs</span>
                    <span className="font-semibold text-foreground dark:text-slate-300">{diagnostics.activeJobs}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-450 font-semibold">Waiting Agent Jobs</span>
                    <span className="font-semibold text-foreground dark:text-slate-300">{diagnostics.waitingJobs}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-450 font-semibold">Failed Agent Jobs</span>
                    <span className="font-semibold text-foreground dark:text-slate-300">{diagnostics.failedJobs}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Free Heuristic Status Info Card */}
          <div className="p-4 rounded-xl border border-border bg-muted/20 text-xs flex gap-2.5 items-start">
            <Info className="h-4 w-4 text-primary mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-foreground">Free Rule-Based Mode Active</span>
              <p className="text-[10px] text-slate-450 leading-relaxed">No paid external AI key configured. Scenario planning runs locally using structural scan heuristic rules.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Sessions table */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-xl font-semibold text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" /> QA Agent Runs History
        </h3>

        {runs.length === 0 ? (
          <div className="text-center border rounded-xl py-12 bg-white dark:bg-slate-900 shadow-sm">
            <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h4 className="font-semibold text-sm text-foreground dark:text-slate-300">No agent sessions triggered</h4>
            <p className="text-xs text-slate-450 max-w-xs mx-auto mt-1.5">
              Select your settings above and trigger the QA Agent Brain to scan layout components.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-md bg-white dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 dark:bg-slate-850 border-b">
                    <th className="p-4 font-medium text-xs text-muted-foreground">Run ID / Created</th>
                    <th className="p-4 font-medium text-xs text-muted-foreground">Mode</th>
                    <th className="p-4 font-medium text-xs text-muted-foreground">Goal</th>
                    <th className="p-4 font-medium text-xs text-muted-foreground">Safety</th>
                    <th className="p-4 font-medium text-xs text-muted-foreground">Status</th>
                    <th className="p-4 font-medium text-xs text-muted-foreground text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-slate-800">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-muted/50 dark:hover:bg-slate-850/40 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-foreground dark:text-slate-200 font-mono text-xs">{run.id.substring(0, 8)}...</div>
                        <div className="text-[10px] text-muted-foreground font-semibold mt-1">
                          {new Date(run.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-block text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20">
                          {run.mode}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-semibold text-muted-foreground">{run.goal}</td>
                      <td className="p-4">
                        <span className="text-xs font-semibold text-rose-600">{run.safetyLevel}</span>
                      </td>
                      <td className="p-4">{getStatusBadge(run.status)}</td>
                      <td className="p-4 text-right flex items-center justify-end gap-2">
                        {!["Completed", "Failed", "Cancelled"].includes(run.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRunToCancel(run.id)}
                            className="text-xs font-semibold text-rose-650 hover:text-rose-750 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20 rounded-xl border-rose-200 dark:border-rose-900"
                          >
                            Cancel
                          </Button>
                        )}
                        <Link href={`/projects/${project.id}/agent/runs/${run.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs font-semibold text-indigo-650 hover:text-primary rounded-xl"
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
