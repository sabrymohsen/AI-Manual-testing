"use client"

import { BusyDot, Skeleton, SkeletonLines } from "@/components/ui/skeleton"
import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Play,
  Code,
  Layers,
  Database,
  Globe,
  Terminal,
  FileText,
  Search,
  Plus,
  Trash2,
  Save,
  Sparkles,
  ClipboardCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Info,
  MousePointerClick,
  Camera,
  Square,
  Download,
  Copy,
  FolderOpen,
  Eye,
  Sliders,
  Activity,
  AlertTriangle,
  Clock,
  Shield,
  LayoutGrid,
  Bot,
  Send,
  SlidersHorizontal,
  Settings,
  Server,
  Lock,
  ListRestart,
  Route,
  Video
} from "@/components/ui/icons"
import HubTestsSection from "@/components/automation-hub/hub-tests"
import HubRunsSection from "@/components/automation-hub/hub-runs"
import { BrowserAgentSection } from "@/components/automation-hub/browser-agent/browser-agent"
import VisualRecorderSection from "@/components/automation-hub/visual-recorder"
import EvidenceVaultSection from "@/components/automation-hub/evidence-vault"
import TraceViewerSection from "@/components/automation-hub/trace-viewer"
import LocatorHealthPanel from "@/components/automation-hub/locator-health"
import WaitAnalysisPanel from "@/components/automation-hub/wait-analysis"
import BrowserMatrixCloudPanel from "@/components/automation-hub/browser-matrix-cloud"
import VisualDiffSection from "@/components/automation-hub/visual-diff"
import VideoLabSection from "@/components/automation-hub/video-lab"
import AiDiagnosisSection from "@/components/automation-hub/ai-diagnosis"
import AiAgentSection from "@/components/automation-hub/ai-agent"
import DataConfigSection from "@/components/automation-hub/data-config"
import { HubToolsMenu } from "@/components/automation-hub/hub-tools-menu"

// Types
interface TestExecutionItem {
  id: string
  status: string
  logOutput: string
  allureLink: string | null
  browser: string | null
  createdAt: string
}

/** A self-healing event as /api/autotest/healing returns it. */
interface HealingEventItem {
  id: string
  originalLocator: string
  recoveredLocator: string
  confidence: number // 0..1
  pageUrl: string
  testName: string
  status: string // "recovered" | "failed" | "needs_review"
  createdAt: string
}

/** A flaky test as /api/autotest/flakes returns it. */
interface FlakyTestItem {
  id: string
  testName: string
  flakinessScore: number // 0..1
  totalRuns: number
  failures: number
  retries: number
  rootCause: string
  suggestedFix: string
}

interface DiagnosisItem {
  id: string
  testName: string
  errorMessage: string
  doctorSummary: string
  remediationSteps: string
  screenshotPath: string | null
  pageSourcePath: string | null
  consoleLogPath: string | null
  networkLogPath: string | null
}

interface MatrixCell {
  id: string
  testId: string
  browserName: string
  status: string
  duration: number
  errorMessage: string | null
  executionDate: string
}

interface McpActivityItem {
  id: string
  action: string
  status: string
  duration: number
  result: string
  createdAt: string
}

export default function AutomationHubPage() {
  const params = useParams()
  const projectId = params.id as string

  // Global Unified States
  const [activeTab, setActiveTab] = useState<
    "Tests" | "Runs" | "Recorder" | "BrowserAgent" | "Evidence" | "Trace" | "Diagnosis" | "Heal" | "Flakes" | "Matrix" | "Visual" | "Video" | "Agent" | "DataConfig"
  >("Tests")
  // ?tab=runs&run=<id> — links from bugs and test cases open that run. Read
  // after mount so the server and first client render agree.
  const [initialRunId, setInitialRunId] = useState<string | null>(null)
  // A recording just saved, or a ?test= link: select it when the Tests tab opens.
  const [focusTestName, setFocusTestName] = useState<string | null>(null)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get("tab")
    if (t === "runs") setActiveTab("Runs")
    else if (t === "recorder") setActiveTab("Recorder")
    else if (t === "agent") setActiveTab("BrowserAgent")
    else if (t === "tests") setActiveTab("Tests")
    // Tools behind "More tools…", so old pages can link straight to them.
    else if (t && ["Trace", "Evidence", "Video", "Diagnosis", "Heal", "Flakes", "Matrix", "Visual", "Agent", "DataConfig"].includes(t)) setActiveTab(t as any)
    setInitialRunId(sp.get("run"))
    // ?test=<name> — e.g. a test just made from a test case.
    const test = sp.get("test")
    if (test) setFocusTestName(test)
  }, [])
  // A test's "Open trace" button opens that exact trace in the Trace Viewer.
  const [pendingTraceId, setPendingTraceId] = useState<string | null>(null)
  const openTrace = (traceId: string) => {
    setPendingTraceId(traceId)
    setActiveTab("Trace")
  }

  // Deep-link target: a Trace Viewer action can request an evidence file be
  // opened over in the Evidence Vault (Section 4 sync).
  const [pendingEvidenceId, setPendingEvidenceId] = useState<string | null>(null)

  // Deep-link target: an Evidence Vault video can open in the Video Lab (Section 10).
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null)

  // Heal Center sub-view: self-healing recoveries vs. locator health report (Section 6)
  const [healView, setHealView] = useState<"recoveries" | "locators">("recoveries")

  // Flake Map sub-view: timing breakdown vs. auto-wait profiler (Section 7)
  const [flakeView, setFlakeView] = useState<"timing" | "waits">("timing")

  // Browser Matrix sub-view: local grid vs. cloud + parallel (Section 8)
  const [matrixView, setMatrixView] = useState<"local" | "cloud">("local")
  
  // SHARED PERSISTENT NAVIGATION CONTEXT
  const [selectedTestName, setSelectedTestName] = useState<string>("LoginFlowTest")

  // Loader & Global Lists
  const [loading, setLoading] = useState(true)
  const [executions, setExecutions] = useState<TestExecutionItem[]>([])

  // 4. Diagnosis Section States
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([])
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<DiagnosisItem | null>(null)
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "doctor"; text: string }[]>([
    { role: "doctor", text: "Test Doctor here. Give me a test spec or paste failure logs to diagnose synchronisation problems." }
  ])
  const [doctorChatInput, setDoctorChatInput] = useState("")

  // 5. Heal Section States
  const [healingEvents, setHealingEvents] = useState<HealingEventItem[]>([])
  const [healingThreshold, setHealingThreshold] = useState(70)

  // 6. Flakes Section States
  const [flakyTests, setFlakyTests] = useState<FlakyTestItem[]>([])

  // 7. Matrix Section States
  const [matrixCells, setMatrixCells] = useState<MatrixCell[]>([])
  const [matrixRecommendation, setMatrixRecommendation] = useState("")
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<MatrixCell | null>(null)
  const [batchTests, setBatchTests] = useState<string[]>(["LoginFlowTest", "ApiCrudTest"])
  const [batchBrowsers, setBatchBrowsers] = useState<string[]>(["Chrome", "Firefox", "Edge"])
  const [matrixProgress, setMatrixProgress] = useState(0)
  const [matrixTotal, setMatrixTotal] = useState(0)
  const [runningMatrixBatch, setRunningMatrixBatch] = useState(false)

  // 8. AI Agent (MCP) Section States
  const [activeMcpSubTab, setActiveMcpSubTab] = useState<"Chat" | "Config">("Chat")
  const [mcpActivities, setMcpActivities] = useState<McpActivityItem[]>([])
  const [mcpServerUrl, setMcpServerUrl] = useState("http://localhost:4000")
  const [mcpProvider, setMcpProvider] = useState("Gemini")
  const [mcpApiKey, setMcpApiKey] = useState("••••••••••••••••••••")
  const [mcpPermissionLevel, setMcpPermissionLevel] = useState("Can Execute Tests")
  const [mcpChatMessages, setMcpChatMessages] = useState<{ role: "user" | "agent"; text: string; toolUsed?: string }[]>([
    { role: "agent", text: "Connected to the MCP Server client console successfully." }
  ])
  const [mcpChatInput, setMcpChatInput] = useState("")
  const [sendingMcp, setSendingMcp] = useState(false)

  // Initial Seed
  useEffect(() => {
    loadAllHubData()
  }, [])

  const loadAllHubData = async () => {
    setLoading(true)
    try {
      // Parallel fetches to hydrate the Automation Hub dashboard
      const [
        executionsRes,
        healRes,
        flakesRes,
        diagnosisRes,
        matrixRes,
        mcpRes
      ] = await Promise.all([
        fetch(`/api/projects/${projectId}/test-runs`),
        fetch(`/api/autotest/healing?projectId=${encodeURIComponent(projectId)}`),
        fetch("/api/autotest/flakes"),
        fetch("/api/autotest/diagnosis"),
        fetch("/api/autotest/crossbrowser"),
        fetch("/api/autotest/mcp")
      ])

      if (executionsRes.ok) {
        const d = await executionsRes.json()
        setExecutions(d.executions || [])
      }

      if (healRes.ok) {
        const d = await healRes.json()
        setHealingEvents(d.events || [])
      }

      if (flakesRes.ok) {
        const d = await flakesRes.json()
        setFlakyTests(d.tests || [])
      }

      if (diagnosisRes.ok) {
        const d = await diagnosisRes.json()
        setDiagnoses(d.diagnoses || [])
        if (d.diagnoses && d.diagnoses.length > 0) {
          setSelectedDiagnosis(d.diagnoses[0])
        }
      }

      if (matrixRes.ok) {
        const d = await matrixRes.json()
        setMatrixCells(d.results || [])
        setMatrixRecommendation(d.recommendation || "")
      }

      if (mcpRes.ok) {
        const d = await mcpRes.json()
        setMcpActivities(d.activities || [])
      }

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // SHARED: When a test context changes, sync sections via the persistent context name
  const handleSelectContextTest = (testName: string) => {
    setSelectedTestName(testName)
  }

  // 4. DIAGNOSIS ACTIONS
  const activeDiagnoses = useMemo(() => {
    return diagnoses.filter(d => d.testName.toLowerCase().includes(selectedTestName.toLowerCase()))
  }, [diagnoses, selectedTestName])

  const handleDoctorSend = async () => {
    if (!doctorChatInput.trim()) return
    const userText = doctorChatInput
    setDoctorChatInput("")
    setChatMessages(prev => [...prev, { role: "user", text: userText }])

    try {
      const res = await fetch("/api/autotest/diagnosis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText, testName: selectedTestName })
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setChatMessages(prev => [...prev, { role: "doctor", text: d.response }])
      } else {
        // Previously the reply was dropped on any non-OK response, so a failing
        // Doctor was indistinguishable from a slow one — the question simply
        // vanished. Say what went wrong instead.
        setChatMessages(prev => [
          ...prev,
          { role: "doctor", text: d.error || "The Doctor could not answer that." }
        ])
      }
    } catch (err) {
      console.error(err)
      setChatMessages(prev => [
        ...prev,
        { role: "doctor", text: "Could not reach the Doctor service." }
      ])
    }
  }

  // 5. HEAL ACTIONS
  const activeHeals = useMemo(() => {
    // Events needing a decision first, then the newest.
    return [...healingEvents].sort((a, b) => Number(b.status === "needs_review") - Number(a.status === "needs_review"))
  }, [healingEvents])

  const [healError, setHealError] = useState<string | null>(null)
  const handleHealAction = async (eventId: string, action: "approve" | "reject") => {
    setHealError(null)
    try {
      const res = await fetch("/api/autotest/healing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, action }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setHealError(d.error || "The change could not be saved. Try again.")
        return
      }
      loadAllHubData()
    } catch {
      setHealError("The change could not be saved because the server could not be reached.")
    }
  }

  // 6. FLAKES ACTIONS
  const activeFlakes = useMemo(() => {
    return flakyTests
  }, [flakyTests])

  // 7. MATRIX ACTIONS
  const matrixMap = useMemo(() => {
    const map: Record<string, Record<string, MatrixCell>> = {}
    const tests = ["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest"]
    const browsers = ["Chrome", "Firefox", "Edge", "Safari"]
    tests.forEach(t => {
      map[t] = {}
      browsers.forEach(b => {
        const match = matrixCells.find(c => c.testId === t && c.browserName === b)
        if (match) {
          map[t][b] = match
        } else {
          map[t][b] = {
            id: `empty-${t}-${b}`,
            testId: t,
            browserName: b,
            status: "not_run",
            duration: 0,
            errorMessage: null,
            executionDate: new Date().toISOString()
          }
        }
      })
    })
    return map
  }, [matrixCells])

  const handleRunMatrixBatch = async () => {
    setRunningMatrixBatch(true)
    setMatrixProgress(0)
    setMatrixTotal(batchTests.length * batchBrowsers.length)
    const timer = setInterval(() => {
      setMatrixProgress(prev => {
        if (prev >= batchTests.length * batchBrowsers.length) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, 450)

    try {
      const res = await fetch("/api/autotest/crossbrowser/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests: batchTests, browsers: batchBrowsers })
      })
      if (res.ok) {
        setTimeout(() => {
          loadAllHubData()
          setRunningMatrixBatch(false)
        }, batchTests.length * batchBrowsers.length * 450)
      }
    } catch (err) {
      console.error(err)
      setRunningMatrixBatch(false)
      clearInterval(timer)
    }
  }

  // 8. AI AGENT ACTIONS
  const handleSendMcpChat = async (promptText: string) => {
    if (!promptText.trim()) return
    setSendingMcp(true)
    setMcpChatInput("")
    setMcpChatMessages(prev => [...prev, { role: "user", text: promptText }])

    try {
      const res = await fetch("/api/autotest/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText })
      })
      if (res.ok) {
        const d = await res.json()
        setMcpChatMessages(prev => [
          ...prev,
          { role: "agent", text: d.response, toolUsed: d.toolUsed }
        ])
        loadAllHubData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSendingMcp(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-xs text-foreground">
      {/* One bar: name, the everyday tabs, and every other tool in one menu. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-6 py-2">
        <h1 className="heading-6 flex items-center gap-2 text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
          Automation Hub
        </h1>

        <nav aria-label="Automation Hub" className="flex flex-wrap items-center gap-1">
          {[
            { id: "Tests", label: "Tests", icon: Code },
            { id: "Runs", label: "Runs", icon: ListRestart },
            { id: "Recorder", label: "Recorder", icon: Camera },
            { id: "BrowserAgent", label: "Browser Agent", icon: Bot },
          ].map((tab) => {
            const on = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </button>
            )
          })}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <HubToolsMenu active={activeTab} onPick={(t) => setActiveTab(t)} />
        </nav>
      </header>

      <div className={`min-h-0 flex-1 overflow-y-auto ${activeTab === "Tests" ? "p-4" : "space-y-6 px-6 py-6"}`}>
      {/* PRIMARY TABS: independent of the analysis tools' data below */}
      {activeTab === "Tests" && (
        <HubTestsSection projectId={projectId} onOpenTrace={openTrace} focusTestName={focusTestName} />
      )}
      {activeTab === "Runs" && <HubRunsSection projectId={projectId} onOpenTrace={openTrace} initialRunId={initialRunId} />}
      {activeTab === "Recorder" && (
        <VisualRecorderSection
          projectId={projectId}
          onSavedToStudio={(name) => {
            setSelectedTestName(name)
            setFocusTestName(name)
          }}
        />
      )}

      {activeTab === "BrowserAgent" && (
        <BrowserAgentSection
          projectId={projectId}
          onOpenRun={(id) => {
            setInitialRunId(id)
            setActiveTab("Runs")
          }}
          onOpenTests={(name) => {
            setFocusTestName(name)
            setActiveTab("Tests")
          }}
        />
      )}

      {/* HUB MAIN WORKSPACE (analysis tools) */}
      {["Tests", "Runs", "Recorder", "BrowserAgent"].includes(activeTab) ? null : loading ? (
<div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm" role="status" aria-label="Loading">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <SkeletonLines lines={3} />
        </div>
      ) : (
        <div className="transition-all duration-300">

          {/* TAB 3: EVIDENCE VAULT */}
          {activeTab === "Evidence" && (
            <EvidenceVaultSection
              initialEvidenceId={pendingEvidenceId}
              onConsumedInitialEvidence={() => setPendingEvidenceId(null)}
              onOpenVideoLab={(id) => {
                setPendingVideoId(id)
                setActiveTab("Video")
              }}
            />
          )}

          {/* TAB 3b: TRACE VIEWER */}
          {activeTab === "Trace" && (
            <TraceViewerSection
              key={pendingTraceId || "traces"}
              initialTraceId={pendingTraceId}
              onOpenEvidence={(id) => {
                setPendingEvidenceId(id)
                setActiveTab("Evidence")
              }}
            />
          )}

          {/* TAB 4: DIAGNOSIS */}
          {activeTab === "Diagnosis" && (
            <AiDiagnosisSection
              selectedTestName={selectedTestName}
              onSelectTest={handleSelectContextTest}
            />
          )}

          {/* TAB 5: HEAL */}
          {activeTab === "Heal" && (
            <div className="space-y-4">
              {/* Heal Center sub-view switch (Self-Healing · Locator Health) */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border w-fit select-none">
                {[
                  { id: "recoveries", label: "Self-Healing", icon: Shield },
                  { id: "locators", label: "Locator health", icon: Activity }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => setHealView(v.id as "recoveries" | "locators")}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      healView === v.id ? "bg-card text-primary shadow-3xs border" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <v.icon size={13} /> {v.label}
                  </button>
                ))}
              </div>

              {healView === "locators" ? (
                <LocatorHealthPanel projectId={projectId} />
              ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <h3 className="title-4 border-b pb-2 text-foreground">Self-healing events</h3>
                  {healError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{healError}</p>}

                  {activeHeals.length > 0 ? (
                    <div className="space-y-3">
                      {activeHeals.map(event => {
                        const pct = Math.round(event.confidence * 100)
                        return (
                        <div key={event.id} className="space-y-3 rounded-xl border bg-card p-4 text-left">
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-foreground" dir="auto" title={event.testName}>{event.testName}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={event.pageUrl}>{event.pageUrl}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                {event.status === "needs_review" ? "Needs review" : event.status === "recovered" ? "Accepted" : "Rejected"}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${pct >= healingThreshold ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                                {pct}% confidence
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 font-mono text-xs md:grid-cols-2">
                            <div className="rounded-xl border bg-muted/50 p-3">
                              <span className="mb-1 block font-sans text-xs text-muted-foreground">Broken locator</span>
                              <span className="block select-all break-all text-foreground">{event.originalLocator}</span>
                            </div>
                            <div className="rounded-xl border border-primary/25 bg-primary/10 p-3">
                              <span className="mb-1 block font-sans text-xs text-primary">Healed locator</span>
                              <span className="block select-all break-all text-primary">{event.recoveredLocator}</span>
                            </div>
                          </div>

                          {event.status === "needs_review" && (
                            <div className="flex justify-end gap-2 border-t pt-2">
                              <Button size="sm" variant="outline" onClick={() => handleHealAction(event.id, "reject")}>
                                Reject
                              </Button>
                              <Button size="sm" onClick={() => handleHealAction(event.id, "approve")}>
                                Approve healed locator
                              </Button>
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">No self-healing events recorded yet. They appear here when a run recovers from a broken locator.</p>
                  )}
                </div>
              </div>

              {/* Sidebar threshold configurators */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4 text-left">
                  <span className="text-xs font-medium text-slate-500 block border-b pb-2">Display</span>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-muted-foreground">Confidence shown in green from</span>
                      <span className="text-indigo-600 font-semibold">{healingThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={healingThreshold}
                      onChange={(e) => setHealingThreshold(Number(e.target.value))}
                      className="w-full h-1 bg-muted rounded-lg cursor-pointer accent-indigo-650"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed block font-medium">
                      Only changes how events are highlighted on this page. It does not change what your test runs do.
                    </span>
                  </div>
                </div>
              </div>
            </div>
              )}
            </div>
          )}

          {/* TAB 6: FLAKES */}
          {activeTab === "Flakes" && (
            <div className="space-y-4">
              {/* Flake Map sub-view switch (Timing Profile · Wait Analysis) */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border w-fit select-none">
                {[
                  { id: "timing", label: "Flaky tests", icon: Activity },
                  { id: "waits", label: "Wait analysis", icon: Clock }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => setFlakeView(v.id as "timing" | "waits")}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      flakeView === v.id ? "bg-card text-primary shadow-3xs border" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <v.icon size={13} /> {v.label}
                  </button>
                ))}
              </div>

              {flakeView === "waits" ? (
                <WaitAnalysisPanel />
              ) : (
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-6">
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <h3 className="title-4 border-b pb-2 text-foreground">Flaky tests</h3>

                  {activeFlakes.length > 0 ? (
                    <div className="space-y-3 text-left">
                      {activeFlakes.map((f) => (
                        <div key={f.id} className="space-y-2 rounded-xl border bg-muted/40 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-foreground" dir="auto">{f.testName}</span>
                            <span className="text-xs font-semibold text-amber-600">{Math.round(f.flakinessScore * 100)}% flaky</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {f.failures} failure{f.failures === 1 ? "" : "s"} and {f.retries} retr{f.retries === 1 ? "y" : "ies"} in {f.totalRuns} run{f.totalRuns === 1 ? "" : "s"}
                          </p>
                          {f.rootCause && <p className="text-xs text-foreground"><span className="font-semibold">Likely cause:</span> {f.rootCause}</p>}
                          {f.suggestedFix && <p className="text-xs text-foreground"><span className="font-semibold">Suggested fix:</span> {f.suggestedFix}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">No flaky tests recorded yet. For real timings from your runs, open Wait analysis.</p>
                  )}
                </div>
              </div>

            </div>
              )}
            </div>
          )}

          {/* TAB 7: BROWSER MATRIX */}
          {activeTab === "Matrix" && (
            <div className="space-y-4">
              {/* Browser Matrix sub-view switch (Local Grid · Cloud & Parallel) */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border w-fit select-none">
                {[
                  { id: "local", label: "Local matrix", icon: LayoutGrid },
                  { id: "cloud", label: "Cloud & parallel", icon: Server }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => setMatrixView(v.id as "local" | "cloud")}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      matrixView === v.id ? "bg-card text-primary shadow-3xs border" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <v.icon size={13} /> {v.label}
                  </button>
                ))}
              </div>

              {matrixView === "cloud" ? (
                <BrowserMatrixCloudPanel />
              ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <span className="text-xs font-medium text-slate-500 block border-b pb-2">Matrix results grid</span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b text-xs font-semibold text-slate-500   text-left">
                          <th className="p-3 text-left w-48">Test class</th>
                          {["Chrome", "Firefox", "Edge", "Safari"].map(b => (
                            <th key={b} className="p-3 text-center">{b}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y text-slate-600 text-left">
                        {["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest"].map(t => (
                          <tr key={t} className="hover:bg-muted/50 transition-colors">
                            <td className="p-3 font-semibold text-foreground text-left truncate w-48">{t}</td>
                            {["Chrome", "Firefox", "Edge", "Safari"].map(b => {
                              const cell = matrixMap[t][b]
                              let iconColor = "text-slate-300"
                              let Icon: any = HelpCircle

                              if (cell.status === "pass") {
                                iconColor = "text-emerald-500 fill-emerald-500/10"
                                Icon = CheckCircle2
                              } else if (cell.status === "fail") {
                                iconColor = "text-rose-500 fill-rose-500/10"
                                Icon = XCircle
                              } else if (cell.status === "flaky") {
                                iconColor = "text-amber-500 fill-amber-500/10"
                                Icon = AlertTriangle
                              }

                              return (
                                <td key={b} className="p-3 text-center">
                                  <button
                                    onClick={() => cell.status !== "not_run" && setSelectedMatrixCell(cell)}
                                    disabled={cell.status === "not_run"}
                                    className={`inline-flex flex-col items-center gap-1 transition-all ${
                                      cell.status !== "not_run" ? "cursor-pointer" : "opacity-40"
                                    }`}
                                  >
                                    <Icon className={`h-5.5 w-5.5 ${iconColor}`} />
                                    <span className="text-xs text-muted-foreground font-mono font-medium block">
                                      {cell.status !== "not_run"
                                        ? new Date(cell.executionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : "Not Run"
                                      }
                                    </span>
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {matrixRecommendation && (
                  <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-3 text-left">
                    <div className="flex items-center gap-2 border-b pb-2 text-primary">
                      <Sparkles size={13} />
                      <span className="text-xs font-medium">Cross-Browser Advice</span>
                    </div>
                    <div className="flex items-start gap-3 bg-primary/10 border border-primary/25 p-3 rounded-xl">
                      <Info className="text-primary shrink-0 mt-0.5" size={14} />
                      <p className="text-slate-600 leading-relaxed font-semibold">
                        {matrixRecommendation}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar matrix batch controls */}
              <div className="lg:col-span-4 space-y-6 text-left">
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <span className="text-xs font-medium text-slate-500 block border-b pb-2">Batch run controls</span>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 block">1. Select Suite Classes</label>
                      <div className="space-y-1">
                        {["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest"].map(t => (
                          <div key={t} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={batchTests.includes(t)}
                              onChange={() => setBatchTests(prev => prev.includes(t) ? prev.filter(item => item !== t) : [...prev, t])}
                              className="h-3.5 w-3.5 rounded border-border text-indigo-600 focus:ring-primary cursor-pointer"
                            />
                            <span className="text-foreground font-semibold font-mono text-xs">{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 block">2. Target Browsers</label>
                      <div className="space-y-1">
                        {["Chrome", "Firefox", "Edge", "Safari"].map(b => (
                          <div key={b} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={batchBrowsers.includes(b)}
                              onChange={() => setBatchBrowsers(prev => prev.includes(b) ? prev.filter(item => item !== b) : [...prev, b])}
                              className="h-3.5 w-3.5 rounded border-border text-indigo-600 focus:ring-primary cursor-pointer"
                            />
                            <span className="text-foreground font-semibold font-mono text-xs">{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {runningMatrixBatch ? (
                      <div className="space-y-2 text-center py-2">
                        <BusyDot />
                        <span className="text-xs text-primary font-semibold">
                          Executing {matrixProgress} of {matrixTotal} combinations...
                        </span>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${(matrixProgress / matrixTotal) * 100}%` }} />
                        </div>
                      </div>
                    ) : (
                      <Button onClick={handleRunMatrixBatch} className="bg-indigo-600 hover:bg-primary/90 text-white rounded-xl w-full h-9.5 font-semibold text-xs">
                        Execute batch matrix suite
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
              )}
            </div>
          )}

          {/* TAB 7b: VISUAL DIFF */}
          {activeTab === "Visual" && <VisualDiffSection projectId={projectId} />}

          {/* TAB 7c: VIDEO LAB */}
          {activeTab === "Video" && (
            <VideoLabSection
              initialVideoId={pendingVideoId}
              onConsumedInitialVideo={() => setPendingVideoId(null)}
            />
          )}

          {/* TAB 8: AI AGENT (MCP) */}
          {activeTab === "Agent" && (
            <AiAgentSection
              projectId={projectId}
              onNavigate={(tab, testName) => {
                if (testName) {
                  setSelectedTestName(testName)
                  setFocusTestName(testName)
                }
                // The old "Test Studio" tab is now "Tests".
                setActiveTab((tab === "Studio" ? "Tests" : tab) as any)
              }}
            />
          )}

          {/* TAB 12: DATA & CONFIG */}
          {activeTab === "DataConfig" && <DataConfigSection />}

        </div>
      )}
      </div>

      {/* ---- DIAGNOSTIC CELL MODAL POPUP ---- */}
      {selectedMatrixCell && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 w-full max-w-md space-y-4 text-foreground">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-semibold text-foreground">Diagnostics matrix cell details</h3>
              <button onClick={() => setSelectedMatrixCell(null)} className="text-muted-foreground hover:text-muted-foreground font-semibold">Close</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground font-semibold block">Test class</span>
                <span className="font-mono font-semibold">{selectedMatrixCell.testId}</span>
              </div>
              <div>
                <span className="text-muted-foreground font-semibold block">Target browser</span>
                <span className="font-mono font-semibold">{selectedMatrixCell.browserName}</span>
              </div>
              <div>
                <span className="text-muted-foreground font-semibold block">Status</span>
                <span className={`font-semibold  ${selectedMatrixCell.status === "pass" ? "text-emerald-600" : "text-rose-600 animate-pulse"}`}>
                  {selectedMatrixCell.status}
                </span>
              </div>
              {selectedMatrixCell.errorMessage && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl">
                  <span className="text-rose-700 font-semibold block">Error trace logs</span>
                  <code className="text-rose-800 font-mono text-xs block select-all break-all mt-1">{selectedMatrixCell.errorMessage}</code>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedMatrixCell(null)} className="flex-1">Close</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function HelpCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  )
}
