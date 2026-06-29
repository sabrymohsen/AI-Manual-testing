"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { 
  CloudUpload, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ExternalLink, 
  Loader2, 
  AlertTriangle,
  Play,
  ArrowLeft,
  ChevronRight,
  Terminal,
  Activity,
  Sparkles,
  Layers,
  FileText,
  Clock,
  ExternalLinkIcon,
  Cpu
} from "lucide-react"

interface TestStep {
  id: string
  stepNumber: number
  actionDescription: string
  actionType: string
  targetType: string
  targetValue: string | null
  inputValue: string | null
  expectedResult: string | null
}

interface StepResult {
  stepNumber: number
  status: string
  actualResult: string | null
  errorDetails: string | null
  screenshotAfter: string | null
}

interface BugReport {
  id: string
  bugKey: string | null
  title: string
  severity: "Low" | "Medium" | "High" | "Critical"
  priority: "Low" | "Medium" | "High" | "Critical"
  environment: string
  roleUsed: string
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  screenshotPath: string | null
  consoleLogs: string | null
  networkErrors: string | null
  browser: string
  viewport: string
  pageUrl: string | null
  osInfo: string | null
  screenResolution: string | null
  videoUrl: string | null
  createdAt: string
  status: "Open" | "InProgress" | "ReadyForRetest" | "Reopened" | "Resolved" | "Closed" | "Rejected" | "Duplicate"
  testCaseId: string | null
  testRunId: string | null
  testRun?: {
    id: string
    status: string
    createdAt: string
    browserType: string
    viewport: string
    testCase?: {
      id: string
      title: string
      module: string
      moduleRelation?: { name: string } | null
      feature?: { name: string } | null
      component?: { name: string } | null
      steps: TestStep[]
    } | null
    stepResults: StepResult[]
  } | null
}

export default function BugReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const bugId = params.bugId as string

  const [bug, setBug] = useState<BugReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [opSync, setOpSync] = useState<{ status: string; externalUrl: string | null; externalId: string | null } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [reRunning, setReRunning] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Active Detail Tab
  const [activeTab, setActiveTab] = useState<"diagnostics" | "execution" | "logs">("diagnostics")

  async function loadBugDetails() {
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports/${bugId}`)
      if (res.ok) {
        const data = await res.json()
        setBug(data.bugReport)
      }
    } catch {
      setToast({ message: "Failed to load bug details", type: "error" })
    } finally {
      setLoading(false)
    }
  }

  // Load OpenProject sync status
  async function loadSyncStatus() {
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/sync-status`)
      if (res.ok) {
        const data = await res.json()
        const mapping = data.syncMap?.[bugId]
        if (mapping) {
          setOpSync({
            status: "success",
            externalId: mapping.externalId,
            externalUrl: mapping.externalUrl
          })
        } else {
          setOpSync({ status: "not_enabled", externalUrl: null, externalId: null })
        }
      }
    } catch {}
  }

  useEffect(() => {
    loadBugDetails()
    loadSyncStatus()
  }, [projectId, bugId])

  // Sync to OpenProject
  async function handleSyncBug() {
    setSyncing(true)
    try {
      const res = await fetch(`/api/bug-reports/${bugId}/sync/openproject`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setOpSync({ status: "success", externalUrl: data.externalUrl || null, externalId: data.externalId || null })
        setToast({ message: "Successfully synced bug report to OpenProject", type: "success" })
      } else {
        setOpSync({ status: "failed", externalUrl: null, externalId: null })
        setToast({ message: data.error || "OpenProject bug sync failed", type: "error" })
      }
    } catch {
      setOpSync({ status: "failed", externalUrl: null, externalId: null })
    } finally {
      setSyncing(false)
    }
  }

  // Trigger automated re-run
  async function handleReRunTest() {
    if (!bug?.testCaseId) return
    setReRunning(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: bug.testCaseId })
      })
      if (res.ok) {
        setToast({ message: "Re-run of automated test case triggered successfully!", type: "success" })
      } else {
        setToast({ message: "Failed to trigger automated run", type: "error" })
      }
    } catch {
      setToast({ message: "Error launching re-run", type: "error" })
    } finally {
      setReRunning(false)
    }
  }

  // Update bug status lifecycle
  async function handleUpdateStatus(newStatus: string) {
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/bug-reports/${bugId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) {
        setToast({ message: `Lifecycle status updated to ${newStatus}`, type: "success" })
        loadBugDetails()
      }
    } catch {
      setToast({ message: "Error updating status", type: "error" })
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleAssignSeverity(bugId: string, newSeverity: string) {
    if (!bug) return
    try {
      const res = await fetch(`/api/bug-reports/${bugId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bug.title,
          severity: newSeverity,
          priority: bug.priority,
          status: bug.status,
          stepsToReproduce: bug.stepsToReproduce,
          expectedResult: bug.expectedResult,
          actualResult: bug.actualResult
        })
      })
      if (res.ok) {
        setToast({ message: `Severity assigned to ${newSeverity}`, type: "success" })
        loadBugDetails()
      }
    } catch {
      setToast({ message: "Error updating severity", type: "error" })
    }
  }

  function downloadMarkdown() {
    if (!bug) return

    const markdown = `# Bug Report: ${bug.title}
    
**Date**: ${new Date(bug.createdAt).toLocaleString()}
**Severity**: ${bug.severity}
**Priority**: ${bug.priority}
**Environment**: ${bug.environment}
**Role Used**: ${bug.roleUsed}
**Browser**: ${bug.browser}
**Viewport**: ${bug.viewport}

## Steps to Reproduce
${bug.stepsToReproduce}

## Expected Result
${bug.expectedResult}

## Actual Result
${bug.actualResult}

${bug.consoleLogs ? `## Console Logs\n\`\`\`\n${bug.consoleLogs}\n\`\`\`\n` : ""}
${bug.networkErrors ? `## Network Errors\n\`\`\`\n${bug.networkErrors}\n\`\`\`\n` : ""}
`

    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bug-report-${bug.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse font-semibold">
        Loading detailed defect statistics...
      </div>
    )
  }

  if (!bug) {
    return (
      <div className="p-8 text-center text-rose-600 font-bold border border-dashed rounded-2xl bg-rose-50/10">
        Defect report record not found or inaccessible.
      </div>
    )
  }

  // AI Rule-Based Analyzer
  function analyzeDefect(actual: string, logs: string) {
    const content = (actual + " " + logs).toLowerCase()
    if (content.includes("timeout") || content.includes("waiting for selector") || content.includes("wait")) {
      return {
        category: "Timing Issue",
        rootCause: "The Playwright driver timed out trying to find the target element or waiting for it to be visible. This usually occurs when dynamic assets or async backend queries take longer than expected.",
        suggestions: [
          "Add an explicit wait condition before this step (e.g. increase timeouts).",
          "Increase step timeoutMs in the test case step builder.",
          "Check network speed or server API latency profiles."
        ]
      }
    }
    if (content.includes("unable to locate") || content.includes("selector") || content.includes("xpath") || content.includes("not found") || content.includes("locator")) {
      return {
        category: "Locator Issue",
        rootCause: "The locator selector used did not match any element on the page. This is usually caused by DOM structural changes, dynamic attribute values, or out of sync locator libraries.",
        suggestions: [
          "Update the locator using standard IDs, classes, or robust data-attributes (e.g. data-testid).",
          "Open locator library and check if selector matches current staging interface.",
          "Confirm if the page changed structure recently."
        ]
      }
    }
    if (content.includes("500") || content.includes("400") || content.includes("api") || content.includes("backend") || content.includes("network") || content.includes("server error")) {
      return {
        category: "Backend Failure",
        rootCause: "An API request returned a failure status code (5xx or 4xx) during test execution, indicating a backend error, database crash, or API contract mismatch.",
        suggestions: [
          "Check server application logs for exceptions corresponding to this timestamp.",
          "Inspect database health and API route connectivity.",
          "Confirm if the request payload fits current endpoint schemas."
        ]
      }
    }
    if (content.includes("visual") || content.includes("styling") || content.includes("css") || content.includes("pixel") || content.includes("mismatch") || content.includes("expected") && content.includes("actual")) {
      return {
        category: "UI Issue",
        rootCause: "A visual comparison check failed, or an expected styling property did not match. This could be due to unexpected CSS regressions, browser rendering differences, or layout shifts.",
        suggestions: [
          "Compare screenshots side by side to detect layout shifts.",
          "Verify styling parameters in stylesheet changes.",
          "Update the reference visual screenshot if this is an expected design update."
        ]
      }
    }
    return {
      category: "Data Issue",
      rootCause: "The test run encountered verification failures that may stem from dynamic credentials, stale records, duplicate entries, or invalid test variables.",
      suggestions: [
        "Review the values defined in the Test Data panel.",
        "Check if user role credentials have expired.",
        "Verify if database records match the expected starting fixtures."
      ]
    }
  }

  const aiDiagnosis = analyzeDefect(bug.actualResult || "", (bug.consoleLogs || "") + " " + (bug.networkErrors || ""))

  // Map case trace steps
  const testRun = bug.testRun
  const steps = testRun?.testCase?.steps || []
  const stepResults = testRun?.stepResults || []
  const failedStepNum = stepResults.find(r => r.status === "Failed" || r.status === "Blocked")?.stepNumber || null

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8 animate-in fade-in duration-200">
      
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-top duration-300 max-w-md ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-800" 
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-800"
        }`}>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Back breadcrumb navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-2">
          <Button
            variant="ghost"
            onClick={() => router.push(`/projects/${projectId}/test-cases`)}
            className="flex items-center gap-1 text-xs text-muted-foreground font-bold hover:text-foreground h-8 p-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Test Workspace
          </Button>

          {testRun?.testCase && (
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <span>{testRun.testCase.moduleRelation?.name || testRun.testCase.module || "General"}</span>
              <ChevronRight className="h-3 w-3" />
              <span>{testRun.testCase.title}</span>
            </div>
          )}

          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            {bug.bugKey ? `${bug.bugKey}: ` : ""}{bug.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            Captured on {new Date(bug.createdAt).toLocaleString()} · Env: {bug.environment}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button onClick={downloadMarkdown} className="font-semibold text-xs h-9 bg-slate-100 hover:bg-slate-200 text-slate-700">
            Export MD
          </Button>
          {bug.testCaseId && (
            <Button disabled={reRunning} onClick={handleReRunTest} className="font-semibold text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5">
              {reRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Re-run Test Case
            </Button>
          )}
        </div>
      </div>

      {/* OpenProject sync widget */}
      {opSync && opSync.status !== "not_enabled" && (
        <div className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold ${
          opSync.status === "success" 
            ? "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-200" 
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800"
        }`}>
          <div className="flex items-center gap-2.5">
            <CloudUpload className="h-4.5 w-4.5 text-blue-500 shrink-0" />
            <div className="space-y-0.5">
              <p>OpenProject Integration Sync Mapped</p>
              {opSync.externalId && (
                <a href={opSync.externalUrl || "#"} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5">
                  WP Work Item #{opSync.externalId} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSyncBug} disabled={syncing} className="h-8 font-bold text-blue-600">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">{opSync.status === "success" ? "Re-sync Work Package" : "Retry Sync"}</span>
          </Button>
        </div>
      )}

      {/* Detail Workspace Tabs */}
      <div className="border-b flex items-center gap-6 text-xs font-bold select-none">
        <button 
          onClick={() => setActiveTab("diagnostics")} 
          className={`pb-3 border-b-2 transition-all ${activeTab === "diagnostics" ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Triage Diagnostics
        </button>
        <button 
          onClick={() => setActiveTab("execution")} 
          className={`pb-3 border-b-2 transition-all ${activeTab === "execution" ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Execution Trace Timeline
        </button>
        <button 
          onClick={() => setActiveTab("logs")} 
          className={`pb-3 border-b-2 transition-all ${activeTab === "logs" ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Console & Network Logs
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left / Main Workspace Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {activeTab === "diagnostics" && (
            <div className="space-y-6 text-xs font-semibold">
              
              {/* Expected vs Actual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-xl p-4 bg-card space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Expected Result</span>
                  <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{bug.expectedResult}</p>
                </div>
                <div className="border border-red-100 dark:border-red-950 rounded-xl p-4 bg-red-500/[0.01] space-y-2">
                  <span className="text-[10px] uppercase font-bold text-red-600">Actual Result / Exception</span>
                  <p className="text-red-700 dark:text-red-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{bug.actualResult}</p>
                </div>
              </div>

              {/* Screenshots evidence */}
              {bug.screenshotPath && (
                <div className="border rounded-xl p-4 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Failure Screenshot</span>
                  <div className="overflow-hidden rounded-lg border max-w-full">
                    <img
                      src={`/api/files/${encodeURIComponent(bug.screenshotPath)}`}
                      alt="Failure capture screenshot"
                      className="max-h-[400px] object-contain mx-auto"
                    />
                  </div>
                </div>
              )}

              {/* Session video evidence */}
              {bug.videoUrl && (
                <div className="border rounded-xl p-4 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Session Recording</span>
                  <div className="overflow-hidden rounded-lg border max-w-full bg-black">
                    <video src={bug.videoUrl} controls className="max-h-[400px] w-full object-contain mx-auto" />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "execution" && (
            <div className="space-y-6">
              
              {/* Timeline list */}
              <div className="border rounded-xl p-6 bg-card space-y-4">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-indigo-500" /> Execution Trace Timeline
                </h3>

                <div className="pl-4 border-l border-muted ml-3 space-y-6 text-xs font-semibold select-none relative pt-2">
                  {/* Start Point */}
                  <div className="relative">
                    <span className="absolute -left-[22px] top-0 h-3.5 w-3.5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[9px] font-bold">
                      &bull;
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-foreground">Playwright Automator session initiated</p>
                      <p className="text-[10px] text-muted-foreground">Browser: {bug.browser || "Chromium"} · Viewport: {bug.viewport || "Desktop"}</p>
                    </div>
                  </div>

                  {/* Steps executions */}
                  {steps.map((step) => {
                    const outcome = stepResults.find(r => r.stepNumber === step.stepNumber)
                    const isFailed = outcome?.status === "Failed" || outcome?.status === "Blocked"
                    const isCompleted = outcome?.status === "Passed"

                    return (
                      <div key={step.id} className="relative">
                        <span className={`absolute -left-[22px] top-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-white shrink-0 ${
                          isFailed ? "bg-red-500" : isCompleted ? "bg-emerald-500" : "bg-slate-300"
                        }`}>
                          {isFailed ? <XCircle className="h-3 w-3" /> : isCompleted ? <CheckCircle2 className="h-3 w-3" /> : null}
                        </span>

                        <div className={`space-y-1.5 p-3 rounded-lg border ${isFailed ? "border-red-200 bg-red-50/10" : "border-transparent"}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-muted-foreground">Step {step.stepNumber}</span>
                            <span className="font-mono text-[9px] uppercase px-1 py-0.5 bg-accent rounded">{step.actionType}</span>
                          </div>
                          <p className="text-foreground">{step.actionDescription}</p>

                          {isFailed && outcome && (
                            <div className="border-t pt-2 mt-2 space-y-1 bg-red-50/20 text-red-700 dark:text-red-400 p-2 rounded">
                              <span className="text-[10px] font-bold uppercase">Exception details:</span>
                              <p className="font-mono text-[10px] leading-relaxed">{outcome.errorDetails || outcome.actualResult}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-4">
              {/* Console Logs */}
              {bug.consoleLogs ? (
                <div className="border rounded-xl p-4 bg-card space-y-2">
                  <span className="text-[10px] uppercase font-bold text-yellow-600 flex items-center gap-1">
                    <Terminal className="h-3.5 w-3.5" /> Browser Console Output
                  </span>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-[10px] font-mono leading-relaxed overflow-x-auto max-h-[300px]">
                    {bug.consoleLogs}
                  </pre>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground text-xs font-semibold border rounded-xl bg-accent/5">
                  No console logs captured for this failure.
                </div>
              )}

              {/* Network Errors */}
              {bug.networkErrors ? (
                <div className="border rounded-xl p-4 bg-card space-y-2">
                  <span className="text-[10px] uppercase font-bold text-red-600 flex items-center gap-1">
                    <Cpu className="h-3.5 w-3.5" /> Mapped Network Errors
                  </span>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-[10px] font-mono leading-relaxed overflow-x-auto max-h-[300px]">
                    {bug.networkErrors}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Right Details Panel */}
        <div className="space-y-6 text-xs font-semibold">
          
          {/* Metadata attributes */}
          <div className="border rounded-xl p-4 bg-card space-y-4">
            <span className="font-bold text-sm text-foreground">Defect Lifecycle</span>
            
            {/* Status change actions */}
            <div className="space-y-2 pb-2">
              <Label>Status transition</Label>
              <select 
                value={bug.status} 
                disabled={updatingStatus}
                onChange={(e) => handleUpdateStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-bold text-indigo-700"
              >
                <option value="Open">Open</option>
                <option value="InProgress">InProgress</option>
                <option value="ReadyForRetest">ReadyForRetest</option>
                <option value="Reopened">Reopened</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
                <option value="Duplicate">Duplicate</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-y-2.5 pt-2 border-t text-xs">
              <span className="text-muted-foreground">Severity:</span>
              <div>
                <select 
                  value={bug.severity}
                  onChange={(e) => handleAssignSeverity(bug.id, e.target.value)}
                  className="bg-transparent font-bold text-red-700 focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <span className="text-muted-foreground">Environment:</span>
              <span className="text-foreground">{bug.environment || "Not set"}</span>

              <span className="text-muted-foreground">Role/User context:</span>
              <span className="text-foreground">{bug.roleUsed || "--"}</span>

              <span className="text-muted-foreground">Browser:</span>
              <span className="text-foreground">{bug.browser || "Chromium"}</span>

              <span className="text-muted-foreground">Viewport:</span>
              <span className="text-foreground">{bug.viewport || "Desktop"}</span>

              {bug.osInfo && (
                <>
                  <span className="text-muted-foreground">OS:</span>
                  <span className="text-foreground">{bug.osInfo}</span>
                </>
              )}

              {bug.screenResolution && (
                <>
                  <span className="text-muted-foreground">Resolution:</span>
                  <span className="text-foreground">{bug.screenResolution}</span>
                </>
              )}

              {bug.pageUrl && (
                <>
                  <span className="text-muted-foreground">Page URL:</span>
                  <a href={bug.pageUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline truncate" title={bug.pageUrl}>{bug.pageUrl}</a>
                </>
              )}
            </div>
          </div>

          {/* AI Local Rule-Based Diagnostics */}
          <div className="border border-indigo-100 dark:border-indigo-950 rounded-xl p-4 bg-indigo-500/[0.01] space-y-4">
            <span className="font-bold text-sm text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-500" /> AI Diagnostic Triage
            </span>
            
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Failure Category</Label>
                <div className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">{aiDiagnosis.category}</div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Root Cause Analysis</Label>
                <p className="text-[11px] text-muted-foreground font-normal leading-relaxed">{aiDiagnosis.rootCause}</p>
              </div>

              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Recommended fixes</Label>
                <ul className="space-y-1.5 list-disc pl-4 text-[11px] text-slate-700 dark:text-slate-300 font-normal leading-relaxed">
                  {aiDiagnosis.suggestions.map((s, idx) => <li key={idx}>{s}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
