"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Cpu,
  Bot,
  AlertOctagon,
  Award,
  ArrowRight,
  Download,
  Copy,
  CheckCircle,
  HelpCircle,
  FileText,
  Terminal,
  Globe,
  Settings,
  MessageSquare,
  Send,
  Eye,
  Activity,
  Loader2,
  Share2
} from "@/components/ui/icons"

interface DiagnosisItem {
  id: string
  testExecutionId: string
  testName: string
  errorMessage: string
  primaryCause: string
  confidence: number
  findings: any
  remediationSteps: string
  similarFailuresCount: number
  doctorReportPath: string
  createdAt: string
}

export default function AIDiagnosisPage() {
  const params = useParams()
  const projectId = params.id as string

  // State arrays
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([])
  const [recurring, setRecurring] = useState<DiagnosisItem[]>([])
  const [selectedItem, setSelectedItem] = useState<DiagnosisItem | null>(null)

  // Evidence view tabs: Screenshot | HTML Source | Console | Network
  const [evidenceTab, setEvidenceTab] = useState<"Screenshot" | "HTML" | "Console" | "Network">("Screenshot")

  // Chatbot states
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "doctor"; text: string }[]>([
    { role: "doctor", text: "Hello! I am the Test Doctor. Select a failure from your Inbox above or type a question about locator breakdowns to begin." }
  ])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [copiedLink, setCopiedLink] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadDiagnoses()
  }, [])

  const loadDiagnoses = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/diagnosis")
      if (res.ok) {
        const data = await res.json()
        setDiagnoses(data.diagnoses || [])
        setRecurring(data.recurring || [])
        if (data.diagnoses?.length > 0) {
          setSelectedItem(data.diagnoses[0])
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Pre-coded replies for Doctor Chat depending on user questions
  const handleSendChatMessage = () => {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }])
    setChatInput("")
    setChatLoading(true)

    setTimeout(() => {
      let replyText = "I have analyzed your request. The trace suggests the target element carries dynamic styling. Prefer a role- or label-based locator over a CSS class or positional index."
      
      const lowercaseMsg = userMsg.toLowerCase()
      if (lowercaseMsg.includes("login") || lowercaseMsg.includes("submit")) {
        replyText = "The login failure occurred because the 'submit-btn-old' ID was removed from the DOM template. I suggest updating the code to: driver.element().click(By.xpath(\"//button[@type='submit' and contains(@class, 'indigo')]\"));"
      } else if (lowercaseMsg.includes("api") || lowercaseMsg.includes("status")) {
        replyText = "The REST Assured assertion failed due to HTTP Status 429 (Rate Limit). Configure your API runner target URL to point to localhost or setup custom retries inside the request headers."
      } else if (lowercaseMsg.includes("settings") || lowercaseMsg.includes("cookies")) {
        replyText = "Billing upgrade failures occur due to stale local browser storage state. Ensure your setUp annotation invokes driver.browser().clearBrowserCookies() to reset profiles cleanly."
      }

      setChatMessages(prev => [...prev, { role: "doctor", text: replyText }])
      setChatLoading(false)
    }, 1200)
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleExportPDF = () => {
    setExporting(true)
    setTimeout(() => {
      setExporting(false)
      alert("PDF report generated successfully! Download started for: " + (selectedItem?.testName.split(".")[1] || "Report") + "-diagnosis.pdf")
    }, 1500)
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-foreground">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="text-indigo-650 animate-pulse h-5 w-5" /> AI Diagnosis
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Intelligent test failure root-cause analysis, trace evidence triage, and step-by-step fix recommendations from your Playwright traces.
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
          <span>Integrated with: test-results/</span>
        </div>
      </div>

      {/* Primary Layout Sections */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground border bg-card rounded-xl">
          <Loader2 className="animate-spin" size={24} />
          <span>Analyzing test executions logs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Failure Inbox list */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-xs font-medium text-slate-450 block border-b pb-2">Failure Inbox</span>
              
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {diagnoses.map(item => {
                  const isSelected = selectedItem?.id === item.id
                  const isHigh = item.confidence >= 0.85
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-primary/10 border-primary/25 shadow-2xs" 
                          : "border-border hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground truncate block max-w-[190px]">
                          {item.testName}
                        </span>
                        <span className={`text-xs font-semibold border px-2 py-0.2 rounded ${
                          isHigh ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {Math.round(item.confidence * 100)}%
                        </span>
                      </div>
                      <span className="text-xs text-rose-500 font-medium block truncate">
                        {item.primaryCause.split(":")[0]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recurring Issues Sidebar list */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-medium text-slate-450">Recurring Failure Signatures</span>
                <span className="bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.2 rounded text-xs font-semibold">Repeated</span>
              </div>
              <div className="space-y-2">
                {recurring.map(item => (
                  <div key={item.id} className="p-3 border border-rose-100 bg-rose-50/10 rounded-xl space-y-1">
                    <span className="font-semibold text-foreground block truncate">{item.testName}</span>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-rose-500 font-mono text-xs">Happened {item.similarFailuresCount} times</span>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="text-primary hover:text-primary font-semibold flex items-center gap-0.5 text-xs"
                      >
                        Inspect <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Diagnosis Detail View */}
          <div className="lg:col-span-8 space-y-6">
            
            {selectedItem ? (
              <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-6">
                
                {/* Header detail action bar */}
                <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{selectedItem.testName}</h2>
                    <span className="text-xs text-muted-foreground font-mono font-medium">Doctor report path: {selectedItem.doctorReportPath}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCopyLink}
                      variant="outline"
                      className="border-border text-foreground h-8 text-xs font-semibold rounded-xl flex items-center gap-1"
                    >
                      <Copy size={11} /> {copiedLink ? "Copied" : "Copy Link"}
                    </Button>
                    <Button
                      onClick={handleExportPDF}
                      disabled={exporting}
                      className="bg-indigo-650 hover:bg-primary/90 text-white h-8 text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs"
                    >
                      {exporting ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Download size={11} />
                      )}
                      Export PDF
                    </Button>
                  </div>
                </div>

                {/* Section 1: What Failed */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-450 block">1. Trace Failure Assertion & Exception</span>
                  <div className="bg-rose-50/30 border border-rose-100 p-3 rounded-xl font-mono text-xs text-rose-700 select-all block whitespace-pre-wrap leading-relaxed">
                    {selectedItem.errorMessage}
                  </div>
                </div>

                {/* Section 2: Evidence Viewer Gallery */}
                <div className="space-y-3">
                  <span className="text-xs font-medium text-slate-450 block">2. Trace Diagnostics Evidence Viewer</span>
                  
                  {/* Evidence Tabs */}
                  <div className="flex border-b text-xs font-semibold bg-muted/50 rounded-xl p-1 border">
                    {[
                      { id: "Screenshot", label: "Screenshot Triage", icon: Eye },
                      { id: "HTML", label: "Page HTML Source", icon: FileText },
                      { id: "Console", label: "Stdout/Stderr Logs", icon: Terminal },
                      { id: "Network", label: "Network Call Logs", icon: Globe }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setEvidenceTab(tab.id as any)}
                        className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-all ${
                          evidenceTab === tab.id
                            ? "bg-card text-primary shadow-xs border"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <tab.icon size={11} />
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Evidence Display Panel */}
                  <div className="border rounded-xl overflow-hidden min-h-[190px] bg-muted/50 p-3 flex flex-col justify-center">
                    {evidenceTab === "Screenshot" && (
                      <div className="relative aspect-video max-w-sm mx-auto border rounded-xl overflow-hidden shadow-2xs bg-muted flex items-center justify-center">
                        <div className="absolute inset-0 [background-size:16px_16px] flex flex-col justify-between p-2">
                          <div className="bg-white/80 border text-xs p-1 rounded font-mono text-center font-semibold">Screenshot at point of exception failure</div>
                          <div className="text-center text-rose-600 flex flex-col items-center gap-1">
                            <AlertOctagon size={24} className="animate-bounce" />
                            <span className="text-xs font-medium bg-rose-50 border px-2 py-0.5 rounded">Element query timeout</span>
                          </div>
                          <div className="bg-slate-800/80 border text-xs p-1 rounded font-mono text-white text-center">Timestamp: {new Date(selectedItem.createdAt).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    )}

                    {evidenceTab === "HTML" && (
                      <pre className="font-mono text-xs text-slate-650 bg-card border p-3 rounded-xl max-h-[160px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                        {`<!DOCTYPE html>\n<html>\n<head>\n  <title>System App Portal</title>\n</head>\n<body>\n  <div id="root">\n    <header>\n      <div class="user-profile-menu">John Doe</div>\n    </header>\n    <main>\n      <!-- Healed layout button styling -->\n      <button type="submit" class="btn btn-indigo-650 rounded-xl px-4 py-2 font-semibold">Submit Credentials</button>\n    </main>\n  </div>\n</body>\n</html>`}
                      </pre>
                    )}

                    {evidenceTab === "Console" && (
                      <pre className="font-mono text-xs text-slate-650 bg-card border p-3 rounded-xl max-h-[160px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                        {`[INFO] 12:41:18 | Initializing chrome driver instance...\n[WARNING] Terminally deprecated method Unsafe::staticFieldBase was called.\n[ERROR] org.openqa.selenium.TimeoutException: Expected element located By.id("submit-btn-old") to be clickable.\n[INFO] Saving triage screenshot attachment under allure-results/\n[INFO] TearDown browser session completed.`}
                      </pre>
                    )}

                    {evidenceTab === "Network" && (
                      <pre className="font-mono text-xs text-slate-650 bg-card border p-3 rounded-xl max-h-[160px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                        {`GET /api/me 200 OK (45ms)\nPOST /api/auth/login 429 Too Many Requests (120ms)\nGET /assets/logo.png 200 OK (20ms)\nGET /api/projects 200 OK (80ms)`}
                      </pre>
                    )}
                  </div>
                </div>

                {/* Section 3: Test Doctor Diagnosis */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border bg-primary/10 p-3 rounded-xl items-center border-primary/25">
                  <div className="md:col-span-2 space-y-1">
                    <span className="text-xs font-medium text-primary block">3. Doctor Primary Cause Diagnosis</span>
                    <p className="text-foreground text-xs font-semibold">{selectedItem.primaryCause}</p>
                  </div>
                  <div className="bg-card border rounded-xl p-3 text-center shadow-3xs">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Confidence Score</span>
                    <span className="text-xl font-semibold text-primary font-mono">{Math.round(selectedItem.confidence * 100)}%</span>
                  </div>
                </div>

                {/* Section 4: How to Fix */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-450 block">4. Doctor Remediation Steps Guide</span>
                  <div className="bg-muted/50 border p-3 rounded-xl text-xs leading-relaxed text-slate-650 space-y-2">
                    {selectedItem.remediationSteps.split("\n").map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 font-medium">
                        <span className="h-4.5 w-4.5 rounded-full bg-primary/10 border border-primary/25 text-primary font-semibold flex items-center justify-center shrink-0 text-xs mt-0.5">{idx + 1}</span>
                        <p>{step.replace(/^\d+\.\s*/, "")}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-24 text-center text-muted-foreground border bg-card rounded-xl flex flex-col items-center justify-center gap-2">
                <AlertOctagon size={32} />
                <span>No failure report selected.</span>
              </div>
            )}

            {/* Doctor Chat conversational panel */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b pb-2 text-primary">
                <Bot size={15} />
                <span className="text-xs font-medium">Chat with the Test Doctor</span>
              </div>

              {/* Chat Message Box logs */}
              <div className="h-44 border rounded-xl bg-muted/50 p-3 overflow-y-auto space-y-2 text-xs">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex items-start gap-2 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                    <div className={`h-6.5 w-6.5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      msg.role === "user" ? "bg-slate-800 text-white" : "bg-indigo-650 text-white"
                    }`}>
                      {msg.role === "user" ? "U" : "D"}
                    </div>
                    <div className={`p-3 rounded-2xl leading-relaxed font-medium ${
                      msg.role === "user" ? "bg-muted text-foreground rounded-tr-none" : "bg-primary/10 border border-primary/25 text-primary rounded-tl-none"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground ">
                    <Loader2 size={10} className="animate-spin" />
                    <span>Doctor is triaging error logs...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Field controls */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                  placeholder="Ask a question about locator breakdowns or api triage response..."
                  className="flex-1 h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs select-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <Button
                  onClick={handleSendChatMessage}
                  disabled={!chatInput.trim()}
                  className="bg-slate-800 hover:bg-slate-900 text-white h-9 w-9 rounded-xl flex items-center justify-center p-0 shrink-0"
                >
                  <Send size={13} />
                </Button>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  )
}
