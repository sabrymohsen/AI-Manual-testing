"use client"

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
} from "lucide-react"
import TestStudioSection from "@/components/automation-hub/test-studio"
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

// Types
interface TestExecutionItem {
  id: string
  status: string
  logOutput: string
  allureLink: string | null
  browser: string | null
  createdAt: string
}

interface HealingEventItem {
  id: string
  locatorName: string
  oldSelector: string
  newSelector: string
  confidence: number
  status: string
  className: string
  methodName: string
  createdAt: string
}

interface FlakyTestItem {
  id: string
  testName: string
  flakinessScore: number
  totalRuns: number
  failedRuns: number
  avgWaitTime: number
  avgSyncTime: number
  avgAssertTime: number
  rootCause: string
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
    "Studio" | "Recorder" | "Evidence" | "Trace" | "Diagnosis" | "Heal" | "Flakes" | "Matrix" | "Visual" | "Video" | "Agent" | "DataConfig"
  >("Studio")

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
    { role: "doctor", text: "Dr. SHAFT AI here. Give me a test script or paste failure logs to diagnose element syncing problems." }
  ])
  const [doctorChatInput, setDoctorChatInput] = useState("")

  // 5. Heal Section States
  const [healingEvents, setHealingEvents] = useState<HealingEventItem[]>([])
  const [healingThreshold, setHealingThreshold] = useState(70)

  // 6. Flakes Section States
  const [flakyTests, setFlakyTests] = useState<FlakyTestItem[]>([])
  const [stabilizeConfig, setStabilizeConfig] = useState(true)

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
    { role: "agent", text: "Connected to SHAFT MCP Server client console successfully." }
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
        fetch("/api/autotest/healing"),
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
        setHealingEvents(d.healingEvents || [])
      }

      if (flakesRes.ok) {
        const d = await flakesRes.json()
        setFlakyTests(d.flakyTests || [])
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
      if (res.ok) {
        const d = await res.json()
        setChatMessages(prev => [...prev, { role: "doctor", text: d.response }])
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 5. HEAL ACTIONS
  const activeHeals = useMemo(() => {
    return healingEvents.filter(h => h.className.toLowerCase().includes(selectedTestName.toLowerCase()))
  }, [healingEvents, selectedTestName])

  const handleApproveHeal = async (healId: string) => {
    try {
      const res = await fetch(`/api/autotest/healing?id=${healId}`, { method: "PUT" })
      if (res.ok) {
        loadAllHubData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 6. FLAKES ACTIONS
  const activeFlakes = useMemo(() => {
    return flakyTests.filter(f => f.testName.toLowerCase().includes(selectedTestName.toLowerCase()))
  }, [flakyTests, selectedTestName])

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
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-slate-800">
      
      {/* HUB GLOBAL HEADER */}
      <div className="flex items-center justify-between gap-4 border-b pb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <Layers className="text-indigo-650 animate-pulse h-5.5 w-5.5" /> SHAFT Automation Hub
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Central Command Center. One unified dashboard for executing, recording, diagnosing, and optimizing automation suites.
          </p>
        </div>

        {/* Global Test Selection Persisted Context Badge */}
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-150 p-2.5 rounded-2xl">
          <Info className="text-indigo-600" size={14} />
          <div className="space-y-0.5 text-left">
            <span className="text-[9.5px] uppercase font-black text-indigo-700 tracking-wider block">Persistent Navigation Context</span>
            <select
              value={selectedTestName}
              onChange={(e) => handleSelectContextTest(e.target.value)}
              className="bg-transparent border-0 text-slate-800 text-xs font-black p-0 focus:ring-0 focus:outline-hidden cursor-pointer"
            >
              <option value="LoginFlowTest">LoginFlowTest (Web)</option>
              <option value="ApiCrudTest">ApiCrudTest (API)</option>
              <option value="DbQueryTest">DbQueryTest (Database)</option>
              <option value="SearchFlowTest">SearchFlowTest (Web)</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABS SELECTOR SYSTEM */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 p-1 border rounded-2xl select-none scrollbar-none">
        {[
          { id: "Studio", label: "Test Studio", icon: Play },
          { id: "Recorder", label: "Recorder", icon: Camera },
          { id: "Evidence", label: "Evidence", icon: FolderOpen },
          { id: "Trace", label: "Trace Viewer", icon: Route },
          { id: "Diagnosis", label: "Diagnosis", icon: Sparkles },
          { id: "Heal", label: "Heal Center", icon: Shield },
          { id: "Flakes", label: "Flake Map", icon: Activity },
          { id: "Matrix", label: "Browser Matrix", icon: LayoutGrid },
          { id: "Visual", label: "Visual Diff", icon: Eye },
          { id: "Video", label: "Video Lab", icon: Video },
          { id: "Agent", label: "AI Agent (MCP)", icon: Bot },
          { id: "DataConfig", label: "Data & Config", icon: Settings }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black tracking-tight shrink-0 transition-all ${
              activeTab === tab.id
                ? "bg-white text-indigo-700 shadow-xs border border-indigo-100/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* HUB MAIN WORKSPACE */}
      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center gap-2 border bg-white rounded-2xl shadow-3xs">
          <Loader2 className="animate-spin text-indigo-650" size={32} />
          <span className="font-extrabold text-slate-450 uppercase tracking-widest text-[9.5px]">Hydrating Automation Hub Suite...</span>
        </div>
      ) : (
        <div className="transition-all duration-300">
          
          {/* TAB 1: TEST STUDIO */}
          {activeTab === "Studio" && (
            <TestStudioSection
              selectedTestName={selectedTestName}
              onSelectTest={handleSelectContextTest}
            />
          )}

          {/* TAB 2: VISUAL RECORDER */}
          {activeTab === "Recorder" && (
            <VisualRecorderSection
              onSavedToStudio={(name) => setSelectedTestName(name)}
            />
          )}


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
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border w-fit select-none">
                {[
                  { id: "recoveries", label: "Self-Healing", icon: Shield },
                  { id: "locators", label: "Locator Health", icon: Activity }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => setHealView(v.id as "recoveries" | "locators")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      healView === v.id ? "bg-white text-indigo-700 shadow-3xs border" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <v.icon size={13} /> {v.label}
                  </button>
                ))}
              </div>

              {healView === "locators" ? (
                <LocatorHealthPanel />
              ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Self-healing recovery events queue</span>
                  
                  {activeHeals.length > 0 ? (
                    <div className="space-y-3">
                      {activeHeals.map(event => (
                        <div key={event.id} className="p-4 border rounded-2xl bg-white space-y-3.5 shadow-3xs text-left">
                          <div className="flex justify-between items-center border-b pb-2 flex-wrap gap-2">
                            <div>
                              <span className="text-[10.5px] font-black text-slate-900 block">{event.locatorName}</span>
                              <span className="text-[9px] text-slate-400 block font-mono mt-0.5">{event.className}.{event.methodName}</span>
                            </div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] border font-black uppercase ${
                              event.confidence >= healingThreshold 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-250 animate-pulse" 
                                : "bg-amber-50 text-amber-700 border-amber-250"
                            }`}>
                              Confidence: {event.confidence}%
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] font-mono leading-relaxed">
                            <div className="bg-slate-50 border p-3 rounded-xl">
                              <span className="text-slate-400 font-bold block uppercase text-[8.5px]">Old broken selector</span>
                              <span className="text-slate-700 block truncate select-all">{event.oldSelector}</span>
                            </div>
                            <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl">
                              <span className="text-indigo-650 font-bold block uppercase text-[8.5px]">Healed recovery selector</span>
                              <span className="text-indigo-900 block truncate select-all">{event.newSelector}</span>
                            </div>
                          </div>

                          {event.status === "pending" && (
                            <div className="flex justify-end gap-2 pt-2 border-t">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => alert("Discarded healed selector suggestion")}
                                className="h-7.5 rounded-lg border-slate-200 text-slate-500 bg-white"
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApproveHeal(event.id)}
                                className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg h-7.5 font-black px-3"
                              >
                                Approve Healed Locator
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-450 italic text-center py-12">No healing events registered for {selectedTestName}. HTML document structure matches locators!</p>
                  )}
                </div>
              </div>

              {/* Sidebar threshold configurators */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4 text-left">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Heal Settings</span>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-500">Auto-Apply Confidence Threshold</span>
                      <span className="text-indigo-650 font-black">{healingThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={healingThreshold}
                      onChange={(e) => setHealingThreshold(Number(e.target.value))}
                      className="w-full h-1 bg-slate-100 rounded-lg cursor-pointer accent-indigo-650"
                    />
                    <span className="text-[8.5px] text-slate-400 leading-relaxed block font-medium">
                      Recoveries with scores below this limit will wait in the manual review queue before modifying Page Objects.
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
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border w-fit select-none">
                {[
                  { id: "timing", label: "Timing Profile", icon: Activity },
                  { id: "waits", label: "Wait Analysis", icon: Clock }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => setFlakeView(v.id as "timing" | "waits")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      flakeView === v.id ? "bg-white text-indigo-700 shadow-3xs border" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <v.icon size={13} /> {v.label}
                  </button>
                ))}
              </div>

              {flakeView === "waits" ? (
                <WaitAnalysisPanel />
              ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Timing performance breakdowns</span>
                  
                  {activeFlakes.length > 0 ? (
                    <div className="space-y-4 text-left">
                      <div className="p-4 border rounded-2xl bg-slate-50/50 space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-bold border-b pb-1">
                          <span className="text-slate-800">{activeFlakes[0].testName} Stability</span>
                          <span className="text-amber-600 font-black">Stability Index: {100 - activeFlakes[0].flakinessScore}%</span>
                        </div>

                        {/* Timing distribution bars */}
                        <div className="space-y-3 pt-2 font-mono text-[9.5px]">
                          <div className="space-y-1">
                            <div className="flex justify-between font-bold text-slate-500">
                              <span>Element wait time</span>
                              <span>{activeFlakes[0].avgWaitTime}ms</span>
                            </div>
                            <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                              <div className="bg-amber-450 h-full" style={{ width: `${(activeFlakes[0].avgWaitTime / 3000) * 100}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between font-bold text-slate-500">
                              <span>Locator sync time</span>
                              <span>{activeFlakes[0].avgSyncTime}ms</span>
                            </div>
                            <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                              <div className="bg-indigo-400 h-full" style={{ width: `${(activeFlakes[0].avgSyncTime / 3000) * 100}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between font-bold text-slate-500">
                              <span>Assertion checks checks</span>
                              <span>{activeFlakes[0].avgAssertTime}ms</span>
                            </div>
                            <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                              <div className="bg-emerald-450 h-full" style={{ width: `${(activeFlakes[0].avgAssertTime / 3000) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-1 text-amber-700">
                          <AlertTriangle size={13} />
                          <span className="text-[10px] font-black uppercase tracking-wider">Root cause diagnosis recommendation</span>
                        </div>
                        <p className="text-slate-650 leading-relaxed font-bold">
                          {activeFlakes[0].rootCause === "sync"
                            ? "Timing sync issue detected. Increasing explicit wait limits or using smart elements wrapper selectors solves this flakiness."
                            : "Dynamic network requests delays. Add explicit assertions limits or verify endpoints response sizes."
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-450 italic text-center py-12">No timing profiling recorded for {selectedTestName}. The test runs with 100% stability index.</p>
                  )}
                </div>
              </div>

              {/* Sidebar stabilization config */}
              <div className="lg:col-span-4 space-y-6 text-left">
                <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Profiler config Controls</span>
                  <div className="flex items-center justify-between p-3 border rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-slate-800 text-[10px]">Enable Flake Profiler</span>
                    <input
                      type="checkbox"
                      checked={stabilizeConfig}
                      onChange={() => setStabilizeConfig(!stabilizeConfig)}
                      className="h-4 w-4 rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-[8.5px] text-slate-400 block font-medium mt-1 leading-relaxed">
                    Automatically instruments surefire test runs classes using Allure profiling interceptors trace.
                  </span>
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
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border w-fit select-none">
                {[
                  { id: "local", label: "Local Matrix", icon: LayoutGrid },
                  { id: "cloud", label: "Cloud & Parallel", icon: Server }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => setMatrixView(v.id as "local" | "cloud")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      matrixView === v.id ? "bg-white text-indigo-700 shadow-3xs border" : "text-slate-500 hover:text-slate-800"
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
                <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Matrix Results Grid</span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b text-[9.5px] font-bold text-slate-450 uppercase tracking-wider text-left">
                          <th className="p-3.5 text-left w-48">Test Class</th>
                          {["Chrome", "Firefox", "Edge", "Safari"].map(b => (
                            <th key={b} className="p-3.5 text-center">{b}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y text-slate-650 text-left">
                        {["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest"].map(t => (
                          <tr key={t} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3.5 font-black text-slate-800 text-left truncate w-48">{t}</td>
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
                                <td key={b} className="p-3.5 text-center">
                                  <button
                                    onClick={() => cell.status !== "not_run" && setSelectedMatrixCell(cell)}
                                    disabled={cell.status === "not_run"}
                                    className={`inline-flex flex-col items-center gap-1 transition-all ${
                                      cell.status !== "not_run" ? "cursor-pointer" : "opacity-40"
                                    }`}
                                  >
                                    <Icon className={`h-5.5 w-5.5 ${iconColor}`} />
                                    <span className="text-[7.5px] text-slate-400 font-mono font-medium block">
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
                  <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-3 text-left">
                    <div className="flex items-center gap-1.5 border-b pb-1.5 text-indigo-700">
                      <Sparkles size={13} />
                      <span className="text-[10px] uppercase font-black tracking-wider">Cross-Browser Advice</span>
                    </div>
                    <div className="flex items-start gap-2.5 bg-indigo-50/50 border border-indigo-100 p-3 rounded-2xl">
                      <Info className="text-indigo-600 shrink-0 mt-0.5" size={14} />
                      <p className="text-slate-650 leading-relaxed font-semibold">
                        {matrixRecommendation}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar matrix batch controls */}
              <div className="lg:col-span-4 space-y-6 text-left">
                <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Batch Run Controls</span>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-450 block uppercase">1. Select Suite Classes</label>
                      <div className="space-y-1">
                        {["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest"].map(t => (
                          <div key={t} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={batchTests.includes(t)}
                              onChange={() => setBatchTests(prev => prev.includes(t) ? prev.filter(item => item !== t) : [...prev, t])}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-650 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-slate-700 font-bold font-mono text-[9.5px]">{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-450 block uppercase">2. Target Browsers</label>
                      <div className="space-y-1">
                        {["Chrome", "Firefox", "Edge", "Safari"].map(b => (
                          <div key={b} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={batchBrowsers.includes(b)}
                              onChange={() => setBatchBrowsers(prev => prev.includes(b) ? prev.filter(item => item !== b) : [...prev, b])}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-650 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-slate-700 font-bold font-mono text-[9.5px]">{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {runningMatrixBatch ? (
                      <div className="space-y-2 text-center py-2">
                        <Loader2 size={16} className="animate-spin text-indigo-650 mx-auto" />
                        <span className="text-[10px] text-indigo-700 font-black">
                          Executing {matrixProgress} of {matrixTotal} combinations...
                        </span>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-650 h-full transition-all duration-300" style={{ width: `${(matrixProgress / matrixTotal) * 100}%` }} />
                        </div>
                      </div>
                    ) : (
                      <Button onClick={handleRunMatrixBatch} className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl w-full h-9.5 font-black text-xs">
                        Execute Batch Matrix Suite
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
          {activeTab === "Visual" && <VisualDiffSection />}

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
              onNavigate={(tab, testName) => {
                if (testName) setSelectedTestName(testName)
                setActiveTab(tab as any)
              }}
            />
          )}

          {/* TAB 12: DATA & CONFIG */}
          {activeTab === "DataConfig" && <DataConfigSection />}

        </div>
      )}

      {/* ---- DIAGNOSTIC CELL MODAL POPUP ---- */}
      {selectedMatrixCell && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-black text-slate-900">Diagnostics Matrix Cell Details</h3>
              <button onClick={() => setSelectedMatrixCell(null)} className="text-slate-400 hover:text-slate-600 font-bold">Close</button>
            </div>
            <div className="space-y-2.5 text-[10.5px]">
              <div>
                <span className="text-slate-400 font-bold block">Test Class</span>
                <span className="font-mono font-black">{selectedMatrixCell.testId}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block">Target Browser</span>
                <span className="font-mono font-black">{selectedMatrixCell.browserName}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block">Status</span>
                <span className={`font-black uppercase ${selectedMatrixCell.status === "pass" ? "text-emerald-600" : "text-rose-600 animate-pulse"}`}>
                  {selectedMatrixCell.status}
                </span>
              </div>
              {selectedMatrixCell.errorMessage && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl">
                  <span className="text-rose-700 font-bold block">Error trace logs</span>
                  <code className="text-rose-800 font-mono text-[9px] block select-all break-all mt-1">{selectedMatrixCell.errorMessage}</code>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedMatrixCell(null)} className="flex-1 rounded-xl bg-white border-slate-200 text-slate-600">Close</Button>
              <Button onClick={() => setSelectedMatrixCell(null)} className="bg-indigo-650 text-white hover:bg-indigo-700 flex-1 rounded-xl font-black">Re-run Cell Combination</Button>
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
