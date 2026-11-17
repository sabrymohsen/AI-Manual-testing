"use client"

import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import DiagnosticsBundlePanel from "@/components/automation-hub/diagnostics-bundle"
import {
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Clock,
  Bug,
  RefreshCw,
  FileText,
  Terminal,
  Server,
  Image,
  Layers,
  ChevronDown,
  ChevronUp,
  Inbox,
  Filter,
  Check,
  History,
  TrendingUp,
  HelpCircle,
  Loader2,
  Bot,
  Code
} from "lucide-react"

interface DiagnosisItem {
  id: string
  testExecutionId: string
  testName: string
  errorMessage: string
  errorType: string
  primaryCause: string
  confidence: number
  findings: any // JSON string or parsed array
  remediationSteps: any // JSON string or parsed array
  status: string
  similarFailuresCount: number
  doctorReportPath: string
  createdAt: string
  resolvedAt: string | null
}

interface RecurringItem {
  signature: string
  count: number
  firstSeen: string
  lastSeen: string
  tests: string[]
}

interface AiDiagnosisProps {
  selectedTestName: string
  onSelectTest: (name: string) => void
}

export default function AiDiagnosisSection({ selectedTestName, onSelectTest }: AiDiagnosisProps) {
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([])
  const [recurring, setRecurring] = useState<RecurringItem[]>([])
  const [selectedItem, setSelectedItem] = useState<DiagnosisItem | null>(null)
  const [loading, setLoading] = useState(true)
  
  // UI Tabs: Report | Recurring
  const [activeSubTab, setActiveSubTab] = useState<"Report" | "Recurring">("Report")

  // Detail Evidence Tab: Screenshot | Source | Console | Network
  const [evidenceTab, setEvidenceTab] = useState<"Screenshot" | "Source" | "Console" | "Network">("Screenshot")

  // Filter States
  const [filterDate, setFilterDate] = useState<"All" | "Today" | "Week">("All")
  const [filterStatus, setFilterStatus] = useState<"All" | "new" | "diagnosing" | "resolved">("All")
  const [sortBy, setSortBy] = useState<"Newest" | "Confidence" | "Severity">("Newest")

  const [inboxCollapsed, setInboxCollapsed] = useState(false)

  // Custom Toast State
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)
  
  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Doctor Chat State
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "doctor"; text: string }[]>([
    { role: "doctor", text: "Test Doctor failure analyzer ready. Paste any stack trace or click an inbox failure item to automatically parse elements." }
  ])
  const [chatInput, setChatInput] = useState("")
  const [chatting, setChatting] = useState(false)

  useEffect(() => {
    loadDiagnosisData()
  }, [])

  const loadDiagnosisData = async () => {
    setLoading(true)
    try {
      const [diagRes, recRes] = await Promise.all([
        fetch("/api/hub/diagnoses"),
        fetch("/api/hub/diagnoses/recurring")
      ])

      if (diagRes.ok) {
        const data = await diagRes.json()
        setDiagnoses(data.diagnoses || [])
        if (data.diagnoses && data.diagnoses.length > 0) {
          setSelectedItem(data.diagnoses[0])
        }
      }

      if (recRes.ok) {
        const data = await recRes.json()
        setRecurring(data.recurring || [])
      }
    } catch (err) {
      console.error("Load diagnoses error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Filter and Sort Logic
  const filteredDiagnoses = useMemo(() => {
    let result = [...diagnoses]

    // Status Filter
    if (filterStatus !== "All") {
      result = result.filter(d => d.status === filterStatus)
    }

    // Date Filter
    if (filterDate === "Today") {
      const today = new Date().toDateString()
      result = result.filter(d => new Date(d.createdAt).toDateString() === today)
    } else if (filterDate === "Week") {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      result = result.filter(d => new Date(d.createdAt) >= oneWeekAgo)
    }

    // Sort Logic
    if (sortBy === "Newest") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } else if (sortBy === "Confidence") {
      result.sort((a, b) => b.confidence - a.confidence)
    } else if (sortBy === "Severity") {
      // Flaky < AssertionFailed < NoSuchElementException
      const severityWeight = (type: string) => {
        if (type === "NoSuchElementException") return 3
        if (type === "AssertionFailed") return 2
        return 1
      }
      result.sort((a, b) => severityWeight(b.errorType) - severityWeight(a.errorType))
    }

    return result
  }, [diagnoses, filterStatus, filterDate, sortBy])

  // Parse JSON helper
  const safeParseJson = (data: any): string[] => {
    if (!data) return []
    if (typeof data === "string") {
      try {
        return JSON.parse(data)
      } catch {
        return [data]
      }
    }
    if (Array.isArray(data)) return data
    return []
  }

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`/api/hub/diagnoses/${id}/resolve`, { method: "PUT" })
      if (res.ok) {
        showToast("Failure marked as Resolved!")
        loadDiagnosisData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleAnalyze = async (id: string) => {
    try {
      const res = await fetch(`/api/hub/diagnoses/${id}/analyze`, { method: "POST" })
      if (res.ok) {
        showToast("Test Doctor analysis triggered successfully!")
        loadDiagnosisData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateBug = async (id: string) => {
    try {
      const res = await fetch(`/api/hub/diagnoses/${id}/bug-ticket`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        showToast(`Bug ticket created successfully! ID: ${data.bugReport.bugKey}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSendChat = () => {
    if (!chatInput.trim()) return
    const userText = chatInput
    setChatInput("")
    setChatMessages(prev => [...prev, { role: "user", text: userText }])
    setChatting(true)

    // Simulate Doctor response
    setTimeout(() => {
      let reply = "Doctor diagnosis: Suggest updates to target CSS styling click coordinates paths."
      if (userText.toLowerCase().includes("element") || userText.toLowerCase().includes("locator")) {
        reply = "Analysis indicates selector changed dynamically. Verify accessibilityIds attributes matching your target flow requirements."
      } else if (userText.toLowerCase().includes("timeout") || userText.toLowerCase().includes("wait")) {
        reply = "Geckodriver threads synchronization collision. Check explicit timeout values in properties configuration keys."
      }
      setChatMessages(prev => [...prev, { role: "doctor", text: reply }])
      setChatting(false)
    }, 1000)
  }

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-450 flex flex-col items-center justify-center gap-2 border bg-card rounded-xl shadow-3xs">
        <Loader2 className="animate-spin text-indigo-650" size={28} />
        <span className="font-medium text-[11px]">Loading Doctor failure diagnostics...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 relative">
      
      {/* SECTION TABS SUB-NAVIGATION */}
      <div className="flex items-center justify-between border-b pb-1.5 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border select-none">
          {[
            { id: "Report", label: "Triage Diagnostics", icon: Sparkles },
            { id: "Recurring", label: "Recurring Failures Map", icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === tab.id
                  ? "bg-card text-primary shadow-3xs border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === "Report" ? (
        <div className="space-y-6">
          
          {/* FAILURE INBOX ROW PANEL */}
          <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b pb-2 select-none">
              <div className="flex items-center gap-2">
                <Inbox size={15} className="text-indigo-650 animate-pulse" />
                <span className="text-[11px] font-medium text-slate-450">Failure Inbox Logs</span>
              </div>
              <button
                onClick={() => setInboxCollapsed(!inboxCollapsed)}
                className="text-muted-foreground hover:text-muted-foreground transition-colors p-1"
              >
                {inboxCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>

            {!inboxCollapsed && (
              <div className="space-y-4">
                {/* Filters Row */}
                <div className="flex items-center gap-4 flex-wrap text-[10px] font-semibold text-muted-foreground select-none">
                  <div className="flex items-center gap-1.5">
                    <Filter size={12} className="text-muted-foreground" />
                    <span>Status:</span>
                    <div className="flex bg-muted p-0.5 rounded-lg border">
                      {(["All", "new", "diagnosing", "resolved"] as const).map(st => (
                        <button
                          key={st}
                          onClick={() => setFilterStatus(st)}
                          className={`px-2 py-0.5 rounded-md uppercase text-[9px] font-semibold ${
                            filterStatus === st ? "bg-card text-primary shadow-3xs" : "text-slate-450 hover:text-foreground"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span>Date:</span>
                    <div className="flex bg-muted p-0.5 rounded-lg border">
                      {(["All", "Today", "Week"] as const).map(dt => (
                        <button
                          key={dt}
                          onClick={() => setFilterDate(dt)}
                          className={`px-2 py-0.5 rounded-md uppercase text-[9px] font-semibold ${
                            filterDate === dt ? "bg-card text-primary shadow-3xs" : "text-slate-450 hover:text-foreground"
                          }`}
                        >
                          {dt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span>Sort:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-muted/50 border rounded-lg px-2 py-0.5 text-[9.5px] cursor-pointer"
                    >
                      <option value="Newest">Newest Date</option>
                      <option value="Confidence">Confidence Score</option>
                      <option value="Severity">Severity Type</option>
                    </select>
                  </div>
                </div>

                {/* Table View */}
                <div className="overflow-x-auto border rounded-xl bg-muted/50">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b text-[9.5px] font-semibold text-slate-450 uppercase tracking-wider">
                        <th className="p-3">Test Name & Method</th>
                        <th className="p-3">Error Type</th>
                        <th className="p-3">Primary Diagnosis Cause</th>
                        <th className="p-3">Confidence</th>
                        <th className="p-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-650 font-semibold">
                      {filteredDiagnoses.map(item => (
                        <tr
                          key={item.id}
                          onClick={() => {
                            setSelectedItem(item)
                            onSelectTest(item.testName.split(" > ")[0])
                          }}
                          className={`hover:bg-muted/50 transition-colors cursor-pointer ${
                            selectedItem?.id === item.id ? "bg-primary/10" : ""
                          }`}
                        >
                          <td className="p-3">
                            <span className="text-foreground block truncate max-w-[200px]">{item.testName}</span>
                            <span className="text-[9.5px] text-muted-foreground font-mono font-medium block mt-0.5">
                              {new Date(item.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-[10px] text-primary bg-primary/10 border border-primary/25 px-2 py-0.5 rounded">
                              {item.errorType}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground font-medium truncate max-w-[220px]">
                            {item.primaryCause}
                          </td>
                          <td className="p-3 font-mono font-semibold text-foreground">
                            {Math.round(item.confidence * 100)}%
                          </td>
                          <td className="p-3 text-right">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] border font-semibold uppercase ${
                              item.status === "new"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : item.status === "diagnosing"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredDiagnoses.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-muted-foreground italic font-medium">
                            No failure records matching the active filter criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* DIAGNOSIS DETAIL CARD PANEL */}
          {selectedItem && (
            <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
              
              {/* Left/Middle detail summaries */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Diagnostics details report */}
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground leading-tight">{selectedItem.testName}</h3>
                      <span className="text-[9.5px] text-muted-foreground font-mono font-medium block mt-0.5">
                        Run Date: {new Date(selectedItem.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] border font-semibold uppercase ${
                        selectedItem.status === "new"
                          ? "bg-rose-50 text-rose-700 border-rose-250 animate-pulse"
                          : selectedItem.status === "diagnosing"
                          ? "bg-amber-50 text-amber-700 border-amber-250 animate-pulse"
                          : "bg-emerald-50 text-emerald-700 border-emerald-250"
                      }`}>
                        {selectedItem.status}
                      </span>
                    </div>
                  </div>

                  {/* What Failed Section */}
                  <div className="space-y-2">
                    <span className="text-[9.5px] font-semibold text-slate-450 block uppercase tracking-wider">What Failed</span>
                    <div className="bg-rose-50/50 border border-rose-100 p-3.5 rounded-xl">
                      <span className="text-[9.5px] font-mono text-rose-750 block font-semibold leading-relaxed select-all">
                        {selectedItem.errorMessage}
                      </span>
                    </div>
                  </div>

                  {/* Doctor Triage Diagnosis details */}
                  <div className="space-y-3 pt-2">
                    <span className="text-[9.5px] font-semibold text-slate-450 block uppercase tracking-wider">Doctor Triage findings</span>
                    
                    <div className="bg-muted/50 border p-3.5 rounded-xl space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-semibold border-b pb-1.5 text-muted-foreground">
                        <span className="font-semibold">Primary Cause: {selectedItem.primaryCause}</span>
                        <span className="text-primary font-semibold bg-primary/10 border border-primary/25 px-2 py-0.2 rounded-full">
                          Confidence {Math.round(selectedItem.confidence * 100)}%
                        </span>
                      </div>
                      
                      <ul className="list-disc pl-4 space-y-1 text-muted-foreground font-medium leading-relaxed">
                        {safeParseJson(selectedItem.findings).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* How to Fix remediation steps */}
                  <div className="bg-primary/10 border border-indigo-150 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-1.5 text-primary border-b border-primary/25 pb-1.5">
                      <Sparkles size={13} className="animate-pulse" />
                      <span className="text-[11px] font-medium">Suggested remediation steps</span>
                    </div>
                    <div className="space-y-3 text-foreground font-medium">
                      <ol className="list-decimal pl-4 space-y-1 leading-relaxed text-muted-foreground font-semibold">
                        {safeParseJson(selectedItem.remediationSteps).map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>
                      
                      {/* suggested locator code snippet */}
                      <div className="space-y-1 pt-1.5">
                        <span className="text-[8.5px] font-semibold text-muted-foreground block uppercase">Recommended Code updates</span>
                        <pre className="font-mono text-[9.5px] font-semibold text-primary bg-card border border-primary/25 p-2.5 rounded-xl select-all">
                          {selectedItem.testName.includes("Login") 
                            ? `driver.element().click(clickableField("Submit"));` 
                            : `driver.element().wait(10000);`
                          }
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t text-[10.5px]">
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleResolve(selectedItem.id)}
                        disabled={selectedItem.status === "resolved"}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8.5 px-3.5 font-semibold text-[11px] shadow-xs flex items-center justify-center gap-1"
                      >
                        <CheckCircle size={12} className="fill-current" /> Mark Resolved
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleAnalyze(selectedItem.id)}
                        className="h-8.5 rounded-xl border-border text-slate-650 bg-card px-3.5 font-semibold shadow-2xs flex items-center justify-center gap-1"
                      >
                        <RefreshCw size={12} /> Re-diagnose
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => handleCreateBug(selectedItem.id)}
                      className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl h-8.5 px-3.5 font-black text-[11px] shadow-xs flex items-center justify-center gap-1"
                    >
                      <Bug size={12} /> File Bug Ticket
                    </Button>
                  </div>

                </div>

                {/* conversational debug chat assistant doctor console */}
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Bot size={15} className="text-indigo-650" />
                    <span className="text-[11px] font-medium text-slate-450">Triage Tunnels chat assistant</span>
                  </div>

                  <div className="h-48 border rounded-xl bg-muted/50 p-4 overflow-y-auto space-y-3 font-semibold leading-relaxed text-[11px] text-slate-750">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex items-start gap-2.5 max-w-[80%] ${msg.role === "user" ? "ml-auto flex-row-reverse text-right" : "text-left"}`}>
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                          msg.role === "user" ? "bg-slate-800 text-white" : "bg-indigo-650 text-white animate-pulse"
                        }`}>
                          {msg.role === "user" ? "U" : "D"}
                        </div>
                        <div className={`p-2.5 rounded-2xl ${
                          msg.role === "user" ? "bg-muted text-foreground rounded-tr-none" : "bg-primary/10 border border-primary/25 text-primary rounded-tl-none font-medium shadow-3xs"
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {chatting && (
                      <div className="flex items-center gap-1.5 text-muted-foreground italic text-[10px]">
                        <Loader2 size={12} className="animate-spin text-indigo-650" />
                        <span>Doctor is analyzing page locators styling context...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                      placeholder="Ask AI Doctor why wait sync elements failed on class btn-main..."
                      className="flex-1 h-9 rounded-xl border border-border px-3 text-xs bg-muted/50"
                    />
                    <Button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim()}
                      className="bg-indigo-650 text-white hover:bg-primary/90 h-9 px-4 rounded-xl font-semibold text-xs shadow-xs"
                    >
                      Send
                    </Button>
                  </div>
                </div>

              </div>

              {/* Right column triage media tools tab selectors */}
              <div className="lg:col-span-4 space-y-6">
                
                <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                  <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Triage Evidence Viewer</span>
                  
                  {/* Evidence media selector */}
                  <div className="flex bg-muted p-0.5 border rounded-xl select-none mb-2">
                    {[
                      { id: "Screenshot", label: "Screenshot", icon: Image },
                      { id: "Source", label: "HTML Source", icon: Code },
                      { id: "Console", label: "Console Log", icon: Terminal },
                      { id: "Network", label: "Network HAR", icon: Server }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setEvidenceTab(tab.id as any)}
                        className={`flex-1 py-1 rounded-lg text-[9px] font-semibold uppercase text-center ${
                          evidenceTab === tab.id ? "bg-card text-primary shadow-3xs" : "text-slate-450 hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic media placeholder frame */}
                  <div className="aspect-video bg-muted border rounded-xl flex items-center justify-center relative overflow-hidden font-mono text-[9px] select-none text-slate-450">
                    <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px] flex flex-col items-center justify-center p-2 text-center">
                      <span className="font-semibold uppercase">{evidenceTab} log details</span>
                      <span className="text-[11px] text-muted-foreground mt-1 block">Click to open raw report logs</span>
                    </div>
                  </div>

                  {/* Similar Failures grouping link */}
                  <div className="bg-primary/10 border border-primary/25 p-3 rounded-xl flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-indigo-950">Similar failure occurrences:</span>
                    <button
                      onClick={() => showToast(`Found ${selectedItem.similarFailuresCount} executions with identical traces.`, "info")}
                      className="text-indigo-650 hover:underline font-semibold font-mono text-[10.5px]"
                    >
                      {selectedItem.similarFailuresCount} tests matched
                    </button>
                  </div>
                </div>

              </div>

            </div>

            {/* SECTION 5: Failure Diagnostics Bundle Viewer */}
            <DiagnosticsBundlePanel
              key={selectedItem.id}
              diagnosisId={selectedItem.id}
              testName={selectedItem.testName}
            />
            </>
          )}

        </div>
      ) : (
        <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b pb-2 select-none">
            <TrendingUp size={15} className="text-indigo-650 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-450">Recurring Issues Groups Map</span>
          </div>

          <div className="space-y-4 text-left">
            {recurring.map((item, idx) => (
              <div key={idx} className="p-4 border rounded-xl bg-muted/50 space-y-3.5 text-[10.5px]">
                <div className="flex justify-between items-center border-b pb-1.5 flex-wrap gap-2 font-semibold text-foreground">
                  <span className="font-mono text-primary truncate max-w-[400px]">{item.signature}</span>
                  <span className="text-[9.5px] bg-rose-50 border border-rose-150 text-rose-700 px-2.5 py-0.5 rounded-full font-semibold animate-pulse">
                    Frequencies: {item.count} hits
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-[10px] text-muted-foreground font-semibold leading-relaxed">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">First witnessed occurrence</span>
                    <span className="text-foreground font-mono font-medium">{new Date(item.firstSeen).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Most recent occurrence</span>
                    <span className="text-foreground font-mono font-medium">{new Date(item.lastSeen).toLocaleDateString()}</span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px] mb-1 font-medium">Involved classes paths</span>
                  <div className="flex flex-wrap gap-1.5">
                    {item.tests.map((test, i) => (
                      <span key={i} className="px-2 py-0.5 text-[9px] bg-card border rounded font-mono font-semibold text-slate-650">
                        {test}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {recurring.length === 0 && (
              <p className="text-muted-foreground italic text-center py-12">No recurring failures found in the run history.</p>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM TOAST NOTIFICATION CONTAINER */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-lg animate-slide-up text-xs font-semibold uppercase ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-250 text-emerald-800" 
            : toast.type === "error"
            ? "bg-rose-50 border-rose-250 text-rose-800"
            : "bg-primary/10 border-indigo-250 text-primary"
        }`}>
          <span>{toast.text}</span>
        </div>
      )}

    </div>
  )
}
