"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, FileSpreadsheet, Plus, CheckSquare, Play, Loader2, ExternalLink, X, Sparkles, ClipboardList, CheckCircle2, XCircle, AlertTriangle, Clock, CloudUpload, Link2 } from "lucide-react"
import { ImportModal } from "@/components/test-cases/import-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OpenProjectModuleGroupsSection } from "@/components/integrations/openproject-module-groups-section"

interface TestStep {
  id: string
  stepNumber: number
  actionDescription: string
  actionType: string
}

interface TestCase {
  id: string
  title: string
  module: string
  priority: string
  source: string
  steps: TestStep[]
}

interface ActiveRun {
  testRunId: string
  projectId: string
  status: string
  currentStep: number | null
  totalSteps: number
}

// Combined execution history entry (automated or manual)
interface HistoryEntry {
  lastStatus: string
  lastRunAt: string
  source: "automated" | "manual"
  runId: string
  sessionName?: string
}

export default function TestCasesPage() {
  const params = useParams()
  const router = useRouter()
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  // Map of testCaseId → latest execution result
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({})
  // OpenProject sync status map: testCaseId → mapping info
  const [syncMap, setSyncMap] = useState<Record<string, { externalId: string; externalUrl: string | null; lastSyncStatus: string | null }>>({})
  const [hasOpIntegration, setHasOpIntegration] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  
  // Selection and action states
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Permanent delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null)
  const [deleteTypedTitle, setDeleteTypedTitle] = useState("")
  const [deleteRunCount, setDeleteRunCount] = useState(0)
  const [deleteBugCount, setDeleteBugCount] = useState(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)

  // Run status tracking
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRun>>(new Map())

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  useEffect(() => {
    fetchTestCases()
    fetchHistory()
    fetchSyncStatus()
  }, [params.id])

  // Poll active runs
  useEffect(() => {
    if (activeRuns.size === 0) return
    const interval = setInterval(async () => {
      const newRuns = new Map(activeRuns)
      let changed = false
      for (const [tcId, run] of Array.from(newRuns)) {
        try {
          const res = await fetch(`/api/projects/${run.projectId}/test-runs/${run.testRunId}/progress`)
          if (res.ok) {
            const data = await res.json()
            const terminal = ["Passed", "Failed", "Blocked", "Warning", "Cancelled"]
            if (terminal.includes(data.status)) {
              newRuns.delete(tcId)
              changed = true
              fetchTestCases()
              fetchHistory() // refresh history after run completes
            } else {
              const totalSteps = data.stepResults?.length || run.totalSteps
              newRuns.set(tcId, {
                ...run,
                status: data.status,
                currentStep: data.currentStep,
                totalSteps
              })
              changed = true
            }
          }
        } catch { /* ignore polling errors */ }
      }
      if (changed) setActiveRuns(newRuns)
    }, 2000)
    return () => clearInterval(interval)
  }, [activeRuns])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(t)
    }
  }, [toast])

  async function fetchTestCases() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/test-cases`)
      const data = await res.json()
      setTestCases(data.testCases || [])
    } catch (err) {
      console.error("Error fetching test cases:", err)
    } finally {
      setLoading(false)
      setSelectedIds([])
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch(`/api/projects/${params.id}/test-cases/history`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.history || {})
      }
    } catch {
      // non-critical — page still works without history
    }
  }

  async function fetchSyncStatus() {
    try {
      const [statusRes, integRes, opRes] = await Promise.all([
        fetch(`/api/projects/${params.id}/integrations/sync-status`),
        fetch(`/api/projects/${params.id}/integrations`),
        fetch(`/api/projects/${params.id}/integrations/openproject`),
      ])
      if (statusRes.ok) {
        const data = await statusRes.json()
        setSyncMap(data.syncMap || {})
      }
      // Check dedicated OpenProject integration first
      if (opRes.ok) {
        const data = await opRes.json()
        if (data.integration?.hasToken) {
          setHasOpIntegration(true)
          return
        }
      }
      // Fallback to legacy IntegrationConfig
      if (integRes.ok) {
        const data = await integRes.json()
        setHasOpIntegration(
          data.integration?.provider === "openproject" &&
          data.integration?.enabled === true &&
          data.integration?.hasToken === true
        )
      }
    } catch {
      // non-critical
    }
  }

  async function handleSyncToOpenProject(ids?: string[]) {
    setIsSyncing(true)
    setToast(null)
    try {
      const res = await fetch(`/api/projects/${params.id}/integrations/openproject/sync-test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids?.length ? { testCaseIds: ids } : {}),
      })
      const data = await res.json()
      if (res.ok) {
        setToast({ message: data.message || `Synced to OpenProject`, type: "success" })
        fetchSyncStatus()
      } else {
        setToast({ message: data.error || "Sync failed", type: "error" })
      }
    } catch {
      setToast({ message: "Network error syncing to OpenProject", type: "error" })
    } finally {
      setIsSyncing(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  function toggleSelectAll() {
    if (selectedIds.length === testCases.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(testCases.map((tc) => tc.id))
    }
  }

  // Open permanent delete modal for a single test case
  async function openDeleteModal(tc: TestCase) {
    setDeleteTarget(tc)
    setDeleteTypedTitle("")
    setDeleteError("")
    setDeleteLoading(false)
    // Fetch run and bug counts
    try {
      const [runsRes] = await Promise.all([
        fetch(`/api/projects/${params.id}/test-runs`)
      ])
      if (runsRes.ok) {
        const runsData = await runsRes.json()
        const runs = (runsData.testRuns || []).filter((r: any) => r.testCaseId === tc.id)
        setDeleteRunCount(runs.length)
        // Count bugs from runs
        const bugCount = runs.reduce((acc: number, r: any) => acc + (r.bugReports?.length || 0), 0)
        setDeleteBugCount(bugCount)
      } else {
        setDeleteRunCount(0)
        setDeleteBugCount(0)
      }
    } catch {
      setDeleteRunCount(0)
      setDeleteBugCount(0)
    }
    setDeleteModalOpen(true)
  }

  // Execute permanent delete
  async function executePermanentDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/test-cases/${deleteTarget.id}/permanent-delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle: deleteTarget.title })
    })

    if (res.ok) {
      const data = await res.json()
      setDeleteModalOpen(false)
      setDeleteTarget(null)
      setToast({ 
        message: `Test case and all related history were permanently deleted. (${data.deleted?.testRuns || 0} runs, ${data.deleted?.steps || 0} steps, ${data.deleted?.bugReports || 0} bugs removed)`,
        type: "success"
      })
      fetchTestCases()
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || "Failed to delete test case")
    }
  }

  // Handle bulk permanent delete
  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    setShowBulkDeleteModal(true)
  }

  async function proceedBulkDelete() {
    let deletedCount = 0
    let failedCount = 0

    for (const id of selectedIds) {
      const tc = testCases.find(t => t.id === id)
      if (!tc) continue
      const res = await fetch(`/api/projects/${params.id}/test-cases/${id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        deletedCount++
      } else {
        failedCount++
      }
    }

    if (failedCount > 0) {
      throw new Error(`Failed to delete ${failedCount} test case(s).`)
    }

    setToast({
      message: `${deletedCount} test case(s) permanently deleted.`,
      type: "success"
    })
    setShowBulkDeleteModal(false)
    fetchTestCases()
  }

  // Run a test case
  async function handleRunTest(tc: TestCase) {
    if (activeRuns.has(tc.id)) return // prevent duplicate

    try {
      const res = await fetch(`/api/projects/${params.id}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id })
      })

      if (res.ok) {
        const data = await res.json()
        const newRuns = new Map(activeRuns)
        newRuns.set(tc.id, {
          testRunId: data.testRun.id,
          projectId: params.id as string,
          status: "Queued",
          currentStep: null,
          totalSteps: tc.steps.length
        })
        setActiveRuns(newRuns)
        setToast({ message: `Test run queued for "${tc.title}"`, type: "success" })
      } else {
        const err = await res.json()
        setToast({ message: err.error || "Failed to start test run", type: "error" })
      }
    } catch {
      setToast({ message: "Network error starting test run", type: "error" })
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      Queued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
      Running: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
      Passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
      Failed: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
      Blocked: "bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-400",
      Warning: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
      Cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
    }
    return colors[status] || "bg-secondary text-secondary-foreground"
  }

  function HistoryBadge({ entry }: { entry: HistoryEntry }) {
    const icons: Record<string, React.ReactNode> = {
      Passed: <CheckCircle2 className="h-3 w-3" />,
      Failed: <XCircle className="h-3 w-3" />,
      Blocked: <AlertTriangle className="h-3 w-3" />,
      Warning: <AlertTriangle className="h-3 w-3" />,
    }
    const date = new Date(entry.lastRunAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    const sourceLabel = entry.source === "manual" ? "Manual" : "Auto"
    const title = entry.source === "manual"
      ? `Last manual: ${entry.sessionName || "session"} on ${date}`
      : `Last automated run on ${date}`

    return (
      <span
        title={title}
        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1 border ${getStatusBadge(entry.lastStatus)}`}
      >
        {icons[entry.lastStatus] ?? <Clock className="h-3 w-3" />}
        {entry.lastStatus}
        <span className="font-normal opacity-70 ml-0.5 normal-case">· {sourceLabel}</span>
      </span>
    )
  }

  function SyncBadge({ tcId }: { tcId: string }) {
    const m = syncMap[tcId]
    if (!hasOpIntegration) return null
    if (!m) {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-muted-foreground/20 text-muted-foreground/50 font-semibold flex items-center gap-0.5 shrink-0">
          <CloudUpload className="h-2.5 w-2.5" /> Not Synced
        </span>
      )
    }
    if (m.lastSyncStatus === "failed") {
      return (
        <span title={`Sync failed`} className="text-[9px] px-1.5 py-0.5 rounded border border-red-200 text-red-600 bg-red-50 font-semibold flex items-center gap-0.5 shrink-0">
          <XCircle className="h-2.5 w-2.5" /> Sync Failed
        </span>
      )
    }
    return (
      <a
        href={m.externalUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title={`OpenProject WP #${m.externalId}`}
        className="text-[9px] px-1.5 py-0.5 rounded border border-blue-200 text-blue-700 bg-blue-50 font-semibold flex items-center gap-0.5 shrink-0 hover:bg-blue-100"
      >
        <Link2 className="h-2.5 w-2.5" /> OP #{m.externalId}
      </a>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-top duration-300 max-w-md ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-800 dark:text-emerald-200" 
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-800 dark:text-red-200"
        }`}>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Test Cases</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage, import, and execute test cases for your project
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => router.push(`/projects/${params.id}/generate-from-file`)}
            className="flex items-center gap-1.5 border-violet-500/30 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/20"
          >
            <Sparkles className="h-4 w-4" /> Generate from File
          </Button>
          <Button 
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 border-green-500/30 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/20"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import from Excel
          </Button>
          {hasOpIntegration && (
            <Button
              variant="outline"
              onClick={() => handleSyncToOpenProject()}
              disabled={isSyncing}
              className="flex items-center gap-1.5 border-blue-400/40 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/20"
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              {isSyncing ? "Syncing..." : "Sync to OpenProject"}
            </Button>
          )}
          <Button 
            onClick={() => router.push(`/projects/${params.id}/test-cases/new`)}
            className="bg-primary hover:bg-primary/95 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Create Test Case
          </Button>
        </div>
      </div>

      {/* Module Groups & OpenProject Sync Section */}
      <div style={{background:"#1d4ed8",color:"#fff",padding:"12px 16px",borderRadius:"8px",fontWeight:"bold",fontSize:"14px"}}>
        ✓ Page updated — Module Coverage section loading below
      </div>
      <OpenProjectModuleGroupsSection projectId={params.id as string} />

      {/* Main Content Area */}
      {loading ? (
        <p className="text-muted-foreground p-6">Loading test cases...</p>
      ) : testCases.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl bg-card/20">
          <p className="text-muted-foreground">No test cases created or imported for this project yet.</p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => router.push(`/projects/${params.id}/generate-from-file`)}
              className="flex items-center gap-1.5 border-violet-500/30 text-violet-600 hover:bg-violet-50"
            >
              <Sparkles className="h-4 w-4" /> Generate from File
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-500" /> Import from Excel
            </Button>
            <Button
              onClick={() => router.push(`/projects/${params.id}/test-cases/new`)}
            >
              Create your first test case
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Bulk Action Bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between p-3.5 bg-accent/20 border rounded-xl animate-in slide-in-from-top duration-200 gap-3 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <CheckSquare className="h-4 w-4" /> {selectedIds.length} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {hasOpIntegration && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncToOpenProject(selectedIds)}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 h-8 text-xs font-bold text-blue-700 border-blue-300 hover:bg-blue-50"
                  >
                    {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                    Sync Selected to OpenProject
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 h-8 text-xs font-bold"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.length})
                </Button>
              </div>
            </div>
          )}

          {/* Test Case Container Table/List */}
          <div className="border rounded-xl divide-y overflow-hidden bg-card/45 shadow-sm">
            {/* Table Header / Select All */}
            <div className="flex items-center gap-3 p-3 bg-accent/20 border-b select-none">
              <input 
                type="checkbox"
                checked={selectedIds.length === testCases.length && testCases.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus:ring-primary cursor-pointer ml-1"
              />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex-1">
                Select All ({testCases.length})
              </span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:block w-40 text-center">
                Last Result
              </span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:block w-20 text-center">
                Priority
              </span>
              <span className="w-24" />
            </div>

            {/* Test Case Rows */}
            {testCases.map((tc) => {
              const activeRun = activeRuns.get(tc.id)
              const isRunning = !!activeRun
              const lastResult = history[tc.id]
              
              return (
                <div
                  key={tc.id}
                  className="flex items-center justify-between p-4 hover:bg-accent/35 transition-colors gap-3 cursor-pointer"
                  onClick={() => router.push(`/projects/${params.id}/test-cases/${tc.id}/edit`)}
                >
                  {/* Left: checkbox + title */}
                  <div className="flex items-center gap-3 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(tc.id)}
                      onChange={() => toggleSelect(tc.id)}
                      className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus:ring-primary cursor-pointer ml-1 shrink-0"
                    />
                    <div className="min-w-0 cursor-pointer" onClick={() => router.push(`/projects/${params.id}/test-cases/${tc.id}/edit`)}>
                      <p className="font-semibold text-foreground text-sm hover:underline truncate">{tc.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground">{tc.module || "General"}</span>
                        {" · "}{tc.steps.length} steps
                        {" · "}<span className="text-muted-foreground">{tc.source}</span>
                      </p>
                    </div>
                  </div>

                  {/* Center: last result history badge */}
                  <div className="hidden sm:flex items-center justify-center w-40 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isRunning ? (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1 ${getStatusBadge(activeRun.status)}`}>
                        {activeRun.status === "Running" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {activeRun.status}
                        {activeRun.status === "Running" && activeRun.currentStep && (
                          <span className="ml-0.5">({activeRun.currentStep}/{activeRun.totalSteps})</span>
                        )}
                      </span>
                    ) : lastResult ? (
                      <HistoryBadge entry={lastResult} />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Not run
                      </span>
                    )}
                  </div>

                  {/* Right: OP sync badge + priority + actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* OpenProject sync badge */}
                    <SyncBadge tcId={tc.id} />

                    <span className={`hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide w-20 justify-center ${
                      tc.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" :
                      tc.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400" :
                      tc.priority === "Medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400" :
                      "bg-secondary text-secondary-foreground"
                    }`}>
                      {tc.priority}
                    </span>

                    {/* Run test button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunTest(tc)}
                      disabled={isRunning || tc.steps.length === 0}
                      className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                      title={isRunning ? "Test is running..." : tc.steps.length === 0 ? "No steps to run" : "Run automated test"}
                    >
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>

                    {/* Open run link when active */}
                    {isRunning && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/projects/${params.id}/test-runs/${activeRun.testRunId}`)}
                        className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400"
                        title="Open live run"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDeleteModal(tc)}
                      disabled={isDeleting}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={deleteModalOpen}
          title={`Permanently delete test case "${deleteTarget.title}"?`}
          description={`This action will permanently delete:\n- The test case\n- All test steps\n- All execution history & test runs\n- All step results, screenshots, logs, and attachments\n\n${
            (deleteRunCount > 0 || deleteBugCount > 0)
              ? `Warning: This test case has ${deleteRunCount} execution run(s) and ${deleteBugCount} linked bug(s). Deleting it will remove all related evidence permanently.`
              : ""
          }`}
          confirmLabel="Delete Permanently"
          cancelLabel="Cancel"
          variant="danger"
          requireTextConfirmation={deleteTarget.title}
          onConfirm={executePermanentDelete}
          onCancel={() => { setDeleteModalOpen(false); setDeleteTarget(null) }}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmDialog
        open={showBulkDeleteModal}
        title={`Permanently Delete ${selectedIds.length} Selected Test Cases?`}
        description={`Are you absolutely sure you want to permanently delete all ${selectedIds.length} selected test cases along with all of their execution runs, steps, screenshots, bug reports, and logs? This action is irreversible.`}
        confirmLabel="Bulk Delete"
        cancelLabel="Cancel"
        variant="danger"
        requireTextConfirmation="DELETE"
        onConfirm={proceedBulkDelete}
        onCancel={() => setShowBulkDeleteModal(false)}
      />

      {/* Excel Import Modal */}
      <ImportModal
        projectId={params.id as string}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={fetchTestCases}
      />
    </div>
  )
}
